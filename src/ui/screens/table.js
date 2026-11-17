import { CARD_VALUES, HAND_SIZE } from '../../core/deck.js';
import {
  applyTimeout,
  canDraw,
  canScore,
  createGame,
  draw,
  getCurrentPlayer,
  getScoreOptions,
  isGameOver,
  scoreTurn,
  toggleLock,
} from '../../core/game.js';
import { getMode } from '../../core/modes.js';
import { getNpc } from '../../ai/index.js';
import { warmUp } from '../../ai/lookahead.js';
import {
  getCharacter,
  preloadCharacter,
  reactToOpponentScore,
  reactToOwnDraw,
  reactToOwnScore,
} from '../characters.js';
import { createAvatar } from '../components/avatar.js';
import { renderCard, renderCardBack } from '../components/card.js';
import { closeDialogs, confirmDialog, showTurnNotice } from '../components/dialog.js';
import { renderScoreboard } from '../components/scoreboard.js';
import { createTurnTimer, formatSeconds } from '../components/turnTimer.js';
import { h } from '../dom.js';
import { categoryName, stars } from '../texts.js';

export const TURN_SECONDS = 45;
const LOW_TIME_SECONDS = 10;
const DEAL_STAGGER_MS = 70;
/** Ritmo das jogadas do NPC. */
const NPC_PAUSE_MS = 700;
const NPC_LOCK_STEP_MS = 280;
const NPC_PICK_MS = 700;
const NPC_AFTER_SCORE_MS = 900;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mesa de jogo. Toda regra vem de src/core/game.js; esta tela só guarda o
 * estado atual, chama as funções do core e redesenha.
 *
 * players: [{ id, name, controller: 'local' | 'npc', npcLevel?, character? }] — no futuro, 'online'.
 * Um assento com `character` ganha avatar na mesa (hoje: o humano contra a máquina).
 */
export function showTable(root, { players, modeId, timerEnabled, onExit, onGameOver }) {
  const rng = Math.random;
  const mode = getMode(modeId);
  let state = createGame({ modeId, players: players.map(({ id, name }) => ({ id, name })) });
  let dealtIndices = new Set();
  let busy = true; // true enquanto um aviso está na tela ou o turno está mudando
  let destroyed = false;
  let remaining = TURN_SECONDS;
  let npcPick = null; // categoria que o NPC vai marcar (destaque)

  if (players.some((p) => p.controller === 'npc')) warmUp();

  // Avatar (personagem) do assento que tiver um.
  const avatarSeat = players.find((p) => p.character);
  const character = avatarSeat ? getCharacter(avatarSeat.character) : null;
  if (character) preloadCharacter(character);
  const avatar = character ? createAvatar(character) : null;

  // Esqueleto persistente: só o conteúdo dos painéis é redesenhado, então o
  // avatar nunca sai do DOM (o fade e as animações não reiniciam a cada clique).
  const headerEl = h('header', { class: 'table-header' });
  const scorePanel = h('section', { class: 'panel score-panel', 'aria-label': 'Tabela de pontuação' });
  const playArea = h('section', { class: 'panel play-area', 'aria-label': 'Mesa' });
  const screen = h(
    'div',
    { class: 'screen table-screen' },
    headerEl,
    h(
      'div',
      { class: avatar ? 'table-layout table-layout--with-avatar' : 'table-layout' },
      scorePanel,
      playArea,
      avatar && h('div', { class: 'avatar-speech-slot' }, avatar.speech),
      avatar && h('div', { class: 'avatar-slot' }, avatar.figure),
    ),
  );
  root.replaceChildren(screen);

  const timer = timerEnabled
    ? createTurnTimer({
        seconds: TURN_SECONDS,
        onTick: (seconds) => {
          remaining = seconds;
          updateTimerDisplay();
        },
        onExpire: handleTimeout,
      })
    : null;

  const playerById = (id) => players.find((p) => p.id === id);
  const currentSeat = () => playerById(getCurrentPlayer(state).id);
  // Só o jogador local da vez interage; na vez do NPC (ou, no futuro, do
  // adversário online) tudo fica desabilitado.
  const isLocalTurn = () => currentSeat()?.controller === 'local';
  const isNpcTurn = () => currentSeat()?.controller === 'npc';
  const canAct = () => !busy && !destroyed && state.status === 'playing' && isLocalTurn();

  // ---------- ações ----------

  /** Tira cartas (do jogador ou do NPC) e marca as novas para animar. */
  function performDraw() {
    const { turn } = state;
    const replaced =
      turn.drawsUsed === 0
        ? [...Array(HAND_SIZE).keys()]
        : turn.locked.flatMap((locked, i) => (locked ? [] : [i]));
    state = draw(state, rng);
    dealtIndices = new Set(replaced);
    render();
    if (avatar && getCurrentPlayer(state).id === avatarSeat.id) {
      avatar.react(reactToOwnDraw(state.turn.hand)); // 5 iguais ou sequência de 5
    }
  }

  function onDraw() {
    if (!canAct() || !canDraw(state)) return;
    performDraw();
  }

  function onToggleLock(index) {
    if (!canAct() || state.turn.drawsUsed === 0) return;
    state = toggleLock(state, index);
    render();
  }

  async function onScore(categoryId) {
    if (!canAct() || !canScore(state, categoryId)) return;
    const points = getScoreOptions(state)[categoryId];
    if (points === 0) {
      const turnBefore = state.turn;
      const confirmed = await confirmDialog({
        title: `Zerar ${categoryName(categoryId)}?`,
        message: 'Esta mão não pontua nessa categoria. Ela ficará com 0 pontos até o fim da partida.',
        confirmText: 'Zerar',
        danger: true,
      });
      // o tempo pode ter acabado enquanto o diálogo estava aberto
      if (!confirmed || state.turn !== turnBefore || !canAct()) return;
    }
    finishTurn(scoreTurn(state, categoryId));
  }

  function handleTimeout() {
    if (destroyed || busy || state.status !== 'playing') return;
    closeDialogs();
    finishTurn(applyTimeout(state, rng), { timedOut: true });
  }

  async function onExitClick() {
    const confirmed = await confirmDialog({
      title: 'Sair da partida?',
      message: 'O progresso desta partida será perdido.',
      confirmText: 'Sair',
      danger: true,
    });
    if (confirmed && !destroyed) {
      destroy();
      onExit();
    }
  }

  // ---------- vez do NPC ----------

  /** Joga o turno do NPC passo a passo: trancar, tirar, e por fim marcar. */
  async function runNpcTurn() {
    const seat = currentSeat();
    const npc = getNpc(seat.npcLevel);
    while (!destroyed && state.status === 'playing' && getCurrentPlayer(state).id === seat.id) {
      await sleep(NPC_PAUSE_MS);
      if (destroyed) return;
      const action = npc.decideAction(state, seat.id, rng);

      if (action.type === 'score') {
        npcPick = action.category;
        render();
        await sleep(NPC_PICK_MS);
        if (destroyed) return;
        npcPick = null;
        finishTurn(scoreTurn(state, action.category), { pauseBeforeNotice: NPC_AFTER_SCORE_MS });
        return;
      }

      if (state.turn.drawsUsed > 0) {
        let changed = false;
        for (let i = 0; i < HAND_SIZE; i++) {
          if (state.turn.locked[i] === action.locks[i]) continue;
          state = toggleLock(state, i);
          changed = true;
          render();
          await sleep(NPC_LOCK_STEP_MS);
          if (destroyed) return;
        }
        if (changed) {
          await sleep(NPC_PAUSE_MS - NPC_LOCK_STEP_MS);
          if (destroyed) return;
        }
      }
      performDraw();
    }
  }

  // ---------- fluxo de turnos ----------

  async function beginTurn(subtitle) {
    busy = true;
    remaining = TURN_SECONDS;
    render();
    await showTurnNotice({ title: `Vez de ${getCurrentPlayer(state).name}`, subtitle });
    if (destroyed) return;
    busy = false;
    render();
    if (isNpcTurn()) {
      avatar?.setBase('thinking', { say: true });
      runNpcTurn();
    } else {
      timer?.start(); // o timer vale só para o humano
    }
  }

  /** Reação do avatar à jogada que acabou de ser marcada. */
  function reactToLastScore() {
    const last = state.lastScored;
    if (!avatar || !last) return;
    avatar.setBase('neutral');
    avatar.react(last.playerId === avatarSeat.id ? reactToOwnScore(last) : reactToOpponentScore(last));
  }

  async function finishTurn(next, { timedOut = false, pauseBeforeNotice = 0 } = {}) {
    timer?.stop();
    state = next;
    dealtIndices = new Set();
    busy = true;
    render();
    reactToLastScore();
    if (pauseBeforeNotice > 0) {
      await sleep(pauseBeforeNotice); // deixa ver a célula recém-marcada
      if (destroyed) return;
    }
    const subtitle = describeLastScore(timedOut);
    if (isGameOver(state)) {
      await showTurnNotice({ title: 'Fim de jogo!', subtitle, duration: 1800 });
      if (destroyed) return;
      destroy();
      onGameOver(state);
      return;
    }
    await beginTurn(subtitle);
  }

  function describeLastScore(timedOut) {
    const last = state.lastScored;
    if (!last) return null;
    const who = playerById(last.playerId).name;
    const what =
      last.points === 0
        ? `${who} zerou ${categoryName(last.categoryId)}`
        : `${who} marcou ${last.points} em ${categoryName(last.categoryId)}`;
    return timedOut ? `Tempo esgotado! ${what}` : what;
  }

  function destroy() {
    destroyed = true;
    timer?.stop();
    avatar?.destroy();
    closeDialogs();
  }

  // ---------- desenho ----------

  function hintText() {
    const { turn } = state;
    if (busy) return '';
    if (isNpcTurn()) return `${getCurrentPlayer(state).name} está jogando…`;
    if (turn.drawsUsed === 0) return 'Clique em “Tirar cartas” para começar o turno.';
    if (canDraw(state)) {
      return 'Clique nas cartas para trancar 🔒 e tire de novo, ou escolha uma categoria na tabela.';
    }
    if (turn.drawsUsed < state.maxDraws) {
      return 'Todas trancadas: destranque alguma carta ou escolha uma categoria na tabela.';
    }
    return 'Sem tiradas: escolha uma categoria na tabela.';
  }

  function renderHand() {
    const { turn } = state;
    if (turn.drawsUsed === 0) return Array.from({ length: HAND_SIZE }, renderCardBack);
    const lockable = canAct() && turn.drawsUsed < state.maxDraws;
    const order = [...dealtIndices];
    return turn.hand.map((value, i) =>
      renderCard(value, {
        locked: turn.locked[i],
        dealt: dealtIndices.has(i),
        delay: order.indexOf(i) * DEAL_STAGGER_MS,
        disabled: !lockable,
        onClick: () => onToggleLock(i),
        focusKey: `card-${i}`,
      }),
    );
  }

  function renderDrawButton() {
    const { drawsUsed } = state.turn;
    const shown = Math.min(drawsUsed + 1, state.maxDraws);
    return h(
      'button',
      {
        type: 'button',
        class: 'btn btn--primary btn--large draw-button',
        disabled: !canAct() || !canDraw(state),
        onClick: onDraw,
        dataset: { focusKey: 'draw' },
      },
      `Tirar cartas (${shown}/${state.maxDraws})`,
    );
  }

  function deckCount() {
    return state.turn.drawsUsed === 0
      ? state.deckCopiesPerValue * CARD_VALUES.length
      : state.turn.deck.length;
  }

  function timerClass() {
    return remaining <= LOW_TIME_SECONDS ? 'timer timer--low' : 'timer';
  }

  function updateTimerDisplay() {
    const el = root.querySelector('.timer');
    if (!el) return;
    el.textContent = formatSeconds(remaining);
    el.className = timerClass();
  }

  function render() {
    if (destroyed) return;
    const focusKey = document.activeElement?.dataset?.focusKey;
    const current = getCurrentPlayer(state);
    const totalTurns = state.categories.length;
    const turnNumber = Math.min(state.round + 1, totalTurns);

    headerEl.replaceChildren(
      h(
        'div',
        { class: 'turn-info' },
        h('span', { class: 'turn-info__label' }, 'Vez de'),
        h('strong', { class: 'turn-info__name' }, current.name),
        h('span', { class: 'turn-info__round' }, `Turno ${turnNumber}/${totalTurns}`),
      ),
      timer &&
        !isNpcTurn() &&
        h(
          'div',
          { class: timerClass(), role: 'timer', 'aria-label': 'Tempo restante do turno' },
          formatSeconds(remaining),
        ),
      h('button', { type: 'button', class: 'btn btn--ghost btn--small', onClick: onExitClick }, 'Sair'),
    );

    scorePanel.replaceChildren(
      renderScoreboard({
        state,
        interactive: canAct(),
        showPreview: !busy && isNpcTurn(),
        highlight: npcPick,
        onScore,
      }),
    );

    playArea.replaceChildren(
      h('p', { class: 'mode-label' }, `${mode.name} `, h('span', { class: 'stars' }, stars(mode.stars))),
      h('div', { class: 'hand' }, renderHand()),
      h('p', { class: 'hint', 'aria-live': 'polite' }, hintText()),
      h(
        'div',
        { class: 'controls' },
        renderDrawButton(),
        h('span', { class: 'deck-count' }, `Baralho: ${deckCount()} cartas`),
      ),
    );

    dealtIndices = new Set(); // a animação só roda uma vez
    if (focusKey) root.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  window.scrollTo(0, 0);
  beginTurn(`Modo ${mode.name}`);
}
