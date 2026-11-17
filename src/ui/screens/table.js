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
import { renderCard, renderCardBack } from '../components/card.js';
import { closeDialogs, confirmDialog, showTurnNotice } from '../components/dialog.js';
import { renderScoreboard } from '../components/scoreboard.js';
import { createTurnTimer, formatSeconds } from '../components/turnTimer.js';
import { h } from '../dom.js';
import { categoryName, stars } from '../texts.js';

export const TURN_SECONDS = 45;
const LOW_TIME_SECONDS = 10;
const DEAL_STAGGER_MS = 70;

/**
 * Mesa de jogo. Toda regra vem de src/core/game.js; esta tela só guarda o
 * estado atual, chama as funções do core e redesenha.
 *
 * players: [{ id, name, controller: 'local' }] — no futuro, 'ai' | 'online'.
 */
export function showTable(root, { players, modeId, timerEnabled, onExit, onGameOver }) {
  const rng = Math.random;
  const mode = getMode(modeId);
  let state = createGame({ modeId, players: players.map(({ id, name }) => ({ id, name })) });
  let dealtIndices = new Set();
  let busy = true; // true enquanto um aviso está na tela ou o turno está mudando
  let destroyed = false;
  let remaining = TURN_SECONDS;

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
  // Ponto de extensão: NPC e online vão responder 'false' aqui na vez deles.
  const isLocalTurn = () => playerById(getCurrentPlayer(state).id)?.controller === 'local';
  const canAct = () => !busy && !destroyed && state.status === 'playing' && isLocalTurn();

  // ---------- ações ----------

  function onDraw() {
    if (!canAct() || !canDraw(state)) return;
    const { turn } = state;
    const replaced =
      turn.drawsUsed === 0
        ? [...Array(HAND_SIZE).keys()]
        : turn.locked.flatMap((locked, i) => (locked ? [] : [i]));
    state = draw(state, rng);
    dealtIndices = new Set(replaced);
    render();
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

  // ---------- fluxo de turnos ----------

  async function beginTurn(subtitle) {
    busy = true;
    remaining = TURN_SECONDS;
    render();
    await showTurnNotice({ title: `Vez de ${getCurrentPlayer(state).name}`, subtitle });
    if (destroyed) return;
    busy = false;
    render();
    timer?.start();
  }

  async function finishTurn(next, { timedOut = false } = {}) {
    timer?.stop();
    state = next;
    dealtIndices = new Set();
    busy = true;
    render();
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
    closeDialogs();
  }

  // ---------- desenho ----------

  function hintText() {
    const { turn } = state;
    if (busy) return '';
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

    const screen = h(
      'div',
      { class: 'screen table-screen' },
      h(
        'header',
        { class: 'table-header' },
        h(
          'div',
          { class: 'turn-info' },
          h('span', { class: 'turn-info__label' }, 'Vez de'),
          h('strong', { class: 'turn-info__name' }, current.name),
          h('span', { class: 'turn-info__round' }, `Turno ${turnNumber}/${totalTurns}`),
        ),
        timer &&
          h(
            'div',
            { class: timerClass(), role: 'timer', 'aria-label': 'Tempo restante do turno' },
            formatSeconds(remaining),
          ),
        h(
          'button',
          { type: 'button', class: 'btn btn--ghost btn--small', onClick: onExitClick },
          'Sair',
        ),
      ),
      h(
        'div',
        { class: 'table-layout' },
        h(
          'section',
          { class: 'panel score-panel', 'aria-label': 'Tabela de pontuação' },
          renderScoreboard({ state, interactive: canAct(), onScore }),
        ),
        h(
          'section',
          { class: 'panel play-area', 'aria-label': 'Mesa' },
          h('p', { class: 'mode-label' }, `${mode.name} `, h('span', { class: 'stars' }, stars(mode.stars))),
          h('div', { class: 'hand' }, renderHand()),
          h('p', { class: 'hint', 'aria-live': 'polite' }, hintText()),
          h(
            'div',
            { class: 'controls' },
            renderDrawButton(),
            h('span', { class: 'deck-count' }, `Baralho: ${deckCount()} cartas`),
          ),
        ),
      ),
    );

    root.replaceChildren(screen);
    dealtIndices = new Set(); // a animação só roda uma vez
    if (focusKey) root.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  window.scrollTo(0, 0);
  beginTurn(`Modo ${mode.name}`);
}
