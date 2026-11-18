import { CARD_VALUES, HAND_SIZE } from '../../core/deck.js';
import {
  canDraw,
  chooseTimeoutCategory,
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
import { attachCategoryTips } from '../components/categoryTip.js';
import { closeDialogs, confirmDialog, showTurnNotice } from '../components/dialog.js';
import { renderScoreboard } from '../components/scoreboard.js';
import { createTurnTimer, formatSeconds } from '../components/turnTimer.js';
import { h } from '../dom.js';
import { describeRemoteChange } from '../remoteChange.js';
import { categoryName, initialOf, stars } from '../texts.js';

export const TURN_SECONDS = 45;
const LOW_TIME_SECONDS = 10;
const DEAL_STAGGER_MS = 70;
/** Duração da animação de uma carta chegando (card.css → card-deal). */
const DEAL_ANIMATION_MS = 450;
/** "Tirar cartas" fica bloqueado depois de cada tirada (evita clique duplo). */
export const DRAW_COOLDOWN_MIN_MS = 700;
/** Ritmo das jogadas do NPC. */
const NPC_PAUSE_MS = 700;
const NPC_LOCK_STEP_MS = 280;
const NPC_PICK_MS = 700;
const NPC_AFTER_SCORE_MS = 900;
/** Pausa depois da marcação do adversário online (para ver a célula). */
const REMOTE_AFTER_SCORE_MS = 900;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mesa de jogo. Toda regra vem de src/core/game.js; esta tela só guarda o
 * estado atual, chama as funções do core e redesenha.
 *
 * players: [{ id, name, controller: 'local' | 'npc' | 'remote', npcLevel?, character? }].
 * Um assento com `character` aparece como personagem (hoje: o Prof. Alishow,
 * que é a máquina); os outros aparecem só com o nome.
 *
 * Online (assento 'remote'): `initialState` é o estado vindo do servidor,
 * `onLocalChange(state)` é chamado a cada mudança feita pelo jogador local
 * (tirar, trancar, marcar, tempo esgotado) e `banner` vai no cabeçalho. A mesa
 * devolve { applyRemote(state), resync(state), destroy() } para receber as
 * jogadas do adversário.
 */
export function showTable(
  root,
  {
    players,
    modeId,
    timerEnabled,
    onExit,
    onGameOver,
    initialState = null,
    onLocalChange = null,
    banner = null,
    exitMessage = 'O progresso desta partida será perdido.',
  },
) {
  const rng = Math.random;
  const mode = getMode(modeId);
  let state = initialState ?? createGame({ modeId, players: players.map(({ id, name }) => ({ id, name })) });
  let dealtIndices = new Set();
  let busy = true; // true enquanto um aviso está na tela ou o turno está mudando
  let destroyed = false;
  let remaining = TURN_SECONDS;
  let npcPick = null; // categoria que o NPC vai marcar (destaque)
  let greeted = false;
  let cooldownTimer = null; // "Tirar cartas" bloqueado enquanto as cartas chegam
  let scoring = false; // marcação em andamento (ignora cliques repetidos)
  let scoreAnimPending = false; // animar a célula recém-marcada no próximo desenho
  let pendingRemote = null; // estado mais novo do adversário online, ainda não aplicado
  let flow = 0; // cada troca de turno ganha um número; fluxos antigos param

  if (players.some((p) => p.controller === 'npc')) warmUp();

  // Personagem do assento que tiver um (o Prof. Alishow, adversário).
  const avatarSeat = players.find((p) => p.character);
  const character = avatarSeat ? getCharacter(avatarSeat.character) : null;
  if (character) preloadCharacter(character);
  const avatar = character ? createAvatar(character, { caption: false }) : null;

  // Lados da mesa: adversário em cima (a máquina, o amigo online ou o
  // jogador 2 no modo local) e o jogador embaixo.
  const topSeat =
    players.find((p) => p.controller === 'npc') ??
    players.find((p) => p.controller === 'remote') ??
    players.find((p) => p.id === 'p2') ??
    players[1];
  const bottomSeat = players.find((p) => p !== topSeat);
  const hasOpponent = players.some((p) => p.controller !== 'local');

  // Esqueleto persistente: só o conteúdo dos painéis é redesenhado, então o
  // avatar nunca sai do DOM (o fade e as animações não reiniciam a cada clique).
  // Layout (styles.css / character.css): no desktop, tabela | cartas | professor
  // em 100dvh; no celular, a tabela rola e o "dock" (professor, cartas e
  // botões) fica fixo embaixo. No desktop o dock é display: contents.
  const headerEl = h('header', { class: 'table-header' });
  const scorePanel = h('section', { class: 'panel score-panel', 'aria-label': 'Tabela de pontuação' });
  // Área das cartas com elementos persistentes: trancar uma carta troca só
  // aquela carta, e o botão "Tirar cartas" nunca é recriado (o cooldown e a
  // barra de progresso não reiniciam a cada desenho).
  const handEl = h('div', { class: 'hand' });
  const hintEl = h('p', { class: 'hint', 'aria-live': 'polite' });
  const drawLabel = h('span', { class: 'draw-button__label' });
  const drawButton = h(
    'button',
    { type: 'button', class: 'btn btn--primary btn--large draw-button', onClick: onDraw, dataset: { focusKey: 'draw' } },
    drawLabel,
  );
  const deckEl = h('span', { class: 'deck-count' });
  const playArea = h(
    'section',
    { class: 'panel play-area', 'aria-label': 'Mesa' },
    handEl,
    hintEl,
    h('div', { class: 'controls' }, drawButton, deckEl),
  );
  const topSeatEl = renderSeat(topSeat, 'top');
  const bottomSeatEl = renderSeat(bottomSeat, 'bottom');
  const screenEl = h(
    'div',
    { class: 'screen table-screen' },
    headerEl,
    h(
      'div',
      { class: `table-layout${avatarSeat ? ' table-layout--character' : ''}` },
      scorePanel,
      h('div', { class: 'table-dock' }, topSeatEl, playArea, bottomSeatEl),
    ),
  );
  // dica das categorias: nunca cobre as cartas; na vez do jogador mostra a mão
  const tips = attachCategoryTips(screenEl, {
    getHandPoints: () => currentHandPoints(),
    avoid: () => [handEl],
  });
  root.replaceChildren(screenEl);

  /**
   * Assento: personagem atrás da mesa de professor (plaquinha com nome e modo
   * na frente da mesa, balão ao lado da cabeça) ou só o nome.
   */
  function renderSeat(seat, side) {
    const turnChip = h('span', { class: 'seat__turn' }, seat.controller === 'local' && hasOpponent ? 'Sua vez' : 'Na vez');
    if (seat === avatarSeat) {
      const level = seat.npcLevel ? character.levels[seat.npcLevel] : null;
      return h(
        'section',
        { class: `seat seat--${side} seat--character`, 'aria-label': seat.name },
        h(
          'div',
          { class: 'seat__stage' },
          h('div', { class: 'seat__avatar' }, avatar.figure),
          avatar.speech,
          h(
            'div',
            { class: 'desk' },
            h(
              'div',
              { class: 'desk__plaque' },
              h('strong', { class: 'desk__name' }, seat.name),
              level && h('span', { class: 'badge badge--level desk__badge' }, level.title),
            ),
            turnChip,
          ),
        ),
      );
    }
    const label = h(
      'div',
      { class: 'seat__label' },
      h('span', { class: 'seat-initial', 'aria-hidden': 'true' }, initialOf(seat.name)),
      h('strong', { class: 'seat__name' }, seat.name),
      turnChip,
    );
    return h('section', { class: `seat seat--${side}`, 'aria-label': seat.name }, label);
  }

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
  // Só o jogador local da vez interage; na vez do NPC ou do adversário
  // online tudo fica desabilitado.
  const isLocalTurn = () => currentSeat()?.controller === 'local';
  const isNpcTurn = () => currentSeat()?.controller === 'npc';
  const isOtherTurn = () => !isLocalTurn();
  const notifyLocal = () => onLocalChange?.(state);
  const canAct = () => !busy && !destroyed && state.status === 'playing' && isLocalTurn();
  /** Pontos da mão atual nas categorias vazias (dica "Sua mão agora"), só na vez do jogador. */
  const currentHandPoints = () => (canAct() && state.turn.drawsUsed > 0 ? getScoreOptions(state) : null);

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
    if (isLocalTurn()) notifyLocal();
    // até a última carta terminar de chegar (no mínimo DRAW_COOLDOWN_MIN_MS)
    if (isLocalTurn()) {
      startDrawCooldown(
        Math.max(DRAW_COOLDOWN_MIN_MS, DEAL_ANIMATION_MS + (replaced.length - 1) * DEAL_STAGGER_MS),
      );
    }
    render();
    if (avatar && getCurrentPlayer(state).id === avatarSeat.id) {
      avatar.react(reactToOwnDraw(state.turn.hand)); // 5 iguais ou sequência de 5
    }
  }

  function onDraw() {
    // cliques durante o cooldown são ignorados (não enfileiram)
    if (cooldownTimer !== null || !canAct() || !canDraw(state)) return;
    performDraw();
  }

  function onToggleLock(index) {
    if (!canAct() || state.turn.drawsUsed === 0) return;
    state = toggleLock(state, index);
    updateCard(index);
    updatePlayStatus();
    notifyLocal();
  }

  async function onScore(categoryId) {
    // ignora cliques repetidos enquanto a marcação (ou o "Zerar?") está em andamento
    if (scoring || !canAct() || !canScore(state, categoryId)) return;
    scoring = true;
    try {
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
      finishTurn(scoreTurn(state, categoryId), { local: true });
    } finally {
      scoring = false;
    }
  }

  /**
   * Tempo esgotado: o mesmo que applyTimeout do core, mas em dois passos
   * (tirar, se ainda não tirou, e depois marcar) para o online gravar cada um
   * separado — as regras do Firestore só aceitam marcar uma mão já gravada.
   */
  function handleTimeout() {
    if (destroyed || busy || state.status !== 'playing') return;
    closeDialogs();
    if (state.turn.drawsUsed === 0) {
      state = draw(state, rng);
      notifyLocal();
    }
    finishTurn(scoreTurn(state, chooseTimeoutCategory(state)), { timedOut: true, local: true });
  }

  async function onExitClick() {
    const confirmed = await confirmDialog({
      title: 'Sair da partida?',
      message: exitMessage,
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
          updateCard(i);
          updatePlayStatus();
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
    const myFlow = ++flow;
    busy = true;
    remaining = TURN_SECONDS;
    render();
    await showTurnNotice({ title: `Vez de ${getCurrentPlayer(state).name}`, subtitle });
    if (destroyed || myFlow !== flow) return;
    busy = false;
    render();
    if (avatar && !greeted) {
      greeted = true; // saudação do nível no começo da partida
      avatar.react('greeting', { lineKey: `greeting_${avatarSeat.npcLevel}` });
    }
    // o personagem fica pensando durante a própria vez
    if (avatar && currentSeat() === avatarSeat) avatar.setBase('thinking', { say: true });
    if (isNpcTurn()) {
      runNpcTurn();
    } else if (isLocalTurn()) {
      timer?.start(); // o timer vale só para o humano (no online, só para quem está na vez)
    }
    processRemote(); // jogadas do adversário que chegaram durante o aviso
  }

  /** Reação do avatar à jogada que acabou de ser marcada. */
  function reactToLastScore() {
    const last = state.lastScored;
    if (!avatar || !last) return;
    avatar.setBase('neutral');
    avatar.react(last.playerId === avatarSeat.id ? reactToOwnScore(last) : reactToOpponentScore(last));
  }

  async function finishTurn(next, { timedOut = false, pauseBeforeNotice = 0, local = false } = {}) {
    const myFlow = ++flow;
    timer?.stop();
    clearTimeout(cooldownTimer);
    cooldownTimer = null;
    state = next;
    if (local) notifyLocal();
    dealtIndices = new Set();
    busy = true;
    scoreAnimPending = true;
    render();
    reactToLastScore();
    if (pauseBeforeNotice > 0) {
      await sleep(pauseBeforeNotice); // deixa ver a célula recém-marcada
      if (destroyed || myFlow !== flow) return;
    }
    const subtitle = describeLastScore(timedOut);
    if (isGameOver(state)) {
      await endGame(subtitle, myFlow);
      return;
    }
    await beginTurn(subtitle);
  }

  async function endGame(subtitle, myFlow) {
    await showTurnNotice({ title: 'Fim de jogo!', subtitle, duration: 1800 });
    if (destroyed || myFlow !== flow) return;
    destroy();
    onGameOver(state);
  }

  // ---------- adversário online ----------

  /** Guarda o estado mais novo do adversário e aplica quando a mesa estiver livre. */
  function applyRemote(next) {
    if (destroyed) return;
    pendingRemote = next;
    processRemote();
  }

  function processRemote() {
    if (!pendingRemote || busy || destroyed) return;
    const next = pendingRemote;
    pendingRemote = null;
    const change = describeRemoteChange(state, next);
    if (change.type === 'none') return;
    if (change.type === 'scored') {
      finishTurn(next, { pauseBeforeNotice: REMOTE_AFTER_SCORE_MS });
      return;
    }
    if (change.type === 'reset') {
      resync(next);
      return;
    }
    state = next;
    if (change.dealt.length > 0) {
      dealtIndices = new Set(change.dealt);
      render();
    } else {
      change.locks.forEach(updateCard);
      updatePlayStatus();
    }
  }

  /** Redesenha tudo com o estado do servidor (conflito ou mudança inesperada). */
  function resync(next, subtitle = 'Partida sincronizada') {
    if (destroyed) return;
    pendingRemote = null;
    timer?.stop();
    clearTimeout(cooldownTimer);
    cooldownTimer = null;
    closeDialogs();
    state = next;
    dealtIndices = new Set();
    if (isGameOver(state)) {
      const myFlow = ++flow;
      busy = true;
      render();
      endGame(null, myFlow);
      return;
    }
    beginTurn(subtitle);
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
    clearTimeout(cooldownTimer);
    avatar?.destroy();
    tips.destroy();
    closeDialogs();
  }

  // ---------- desenho ----------

  function hintText() {
    const { turn } = state;
    if (busy) return '';
    if (isOtherTurn()) return `${getCurrentPlayer(state).name} está jogando…`;
    if (turn.drawsUsed === 0) return 'Clique em “Tirar cartas” para começar o turno.';
    if (canDraw(state)) {
      return 'Clique nas cartas para trancar 🔒 e tire de novo, ou escolha uma categoria na tabela.';
    }
    if (turn.drawsUsed < state.maxDraws) {
      return 'Todas trancadas: destranque alguma carta ou escolha uma categoria na tabela.';
    }
    return 'Sem tiradas: escolha uma categoria na tabela.';
  }

  /** Elemento de uma carta da mão (frente). */
  function cardElement(i, { dealt = false, delay = 0 } = {}) {
    const { turn } = state;
    const lockable = canAct() && turn.drawsUsed < state.maxDraws;
    return renderCard(turn.hand[i], {
      locked: turn.locked[i],
      dealt,
      delay,
      disabled: !lockable,
      onClick: () => onToggleLock(i),
      focusKey: `card-${i}`,
    });
  }

  function renderHand() {
    const { turn } = state;
    if (turn.drawsUsed === 0) {
      handEl.replaceChildren(...Array.from({ length: HAND_SIZE }, renderCardBack));
    } else {
      const order = [...dealtIndices];
      handEl.replaceChildren(
        ...turn.hand.map((_, i) =>
          cardElement(i, { dealt: dealtIndices.has(i), delay: order.indexOf(i) * DEAL_STAGGER_MS }),
        ),
      );
    }
    dealtIndices = new Set(); // a animação só roda uma vez
  }

  /** Trancar/destrancar: troca só a carta clicada (a tabela não é redesenhada). */
  function updateCard(i) {
    const old = handEl.children[i];
    if (!old || state.turn.drawsUsed === 0) return;
    const hadFocus = old === document.activeElement;
    const next = cardElement(i);
    old.replaceWith(next);
    if (hadFocus) next.focus();
  }

  /** Dica de texto, botão "Tirar cartas" (persistente) e baralho. */
  function updatePlayStatus() {
    hintEl.textContent = hintText();
    const { drawsUsed } = state.turn;
    const shown = Math.min(drawsUsed + 1, state.maxDraws);
    drawLabel.textContent = `Tirar cartas (${shown}/${state.maxDraws})`;
    drawButton.disabled = !canAct() || !canDraw(state);
    // no cooldown o botão continua focável (aria-disabled), mas ignora cliques
    const cooling = cooldownTimer !== null;
    drawButton.classList.toggle('draw-button--cooldown', cooling);
    if (cooling) drawButton.setAttribute('aria-disabled', 'true');
    else drawButton.removeAttribute('aria-disabled');
    deckEl.textContent = `Baralho: ${deckCount()} cartas`;
  }

  /** Depois de tirar: botão bloqueado até a animação das cartas terminar. */
  function startDrawCooldown(ms) {
    clearTimeout(cooldownTimer);
    drawButton.style.setProperty('--cooldown-ms', `${ms}ms`);
    drawButton.classList.remove('draw-button--cooldown');
    void drawButton.offsetWidth; // reinicia a barra de progresso
    cooldownTimer = setTimeout(() => {
      cooldownTimer = null;
      if (!destroyed) updatePlayStatus();
    }, ms);
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

    // (replaceChildren do DOM escreveria "null"; por isso o filtro)
    headerEl.replaceChildren(
      ...[
        h(
          'div',
          { class: 'turn-info' },
          h('span', { class: 'turn-info__label' }, 'Vez de'),
          h('strong', { class: 'turn-info__name' }, current.name),
          h('span', { class: 'turn-info__round' }, `Turno ${turnNumber}/${totalTurns}`),
          h(
            'span',
            { class: 'turn-info__mode' },
            `${mode.name} `,
            h('span', { class: 'stars', 'aria-label': `${mode.stars} de 5 estrelas` }, stars(mode.stars)),
          ),
        ),
        banner,
        timer &&
          !isOtherTurn() &&
          h(
            'div',
            { class: timerClass(), role: 'timer', 'aria-label': 'Tempo restante do turno' },
            formatSeconds(remaining),
          ),
        h('button', { type: 'button', class: 'btn btn--ghost btn--small', onClick: onExitClick }, 'Sair'),
      ].filter(Boolean),
    );

    scorePanel.replaceChildren(
      renderScoreboard({
        state,
        seats: players,
        interactive: canAct(),
        showPreview: !busy && isOtherTurn(),
        highlight: npcPick,
        handPoints: currentHandPoints(),
        // o destaque da célula recém-marcada roda uma vez só (no 1º desenho)
        animateLast: scoreAnimPending,
        onScore,
      }),
    );
    scoreAnimPending = false;

    renderHand();
    updatePlayStatus();

    // destaca o lado de quem está na vez
    const playing = state.status === 'playing';
    topSeatEl.classList.toggle('seat--active', playing && current.id === topSeat.id);
    bottomSeatEl.classList.toggle('seat--active', playing && current.id === bottomSeat.id);

    if (focusKey && document.activeElement?.dataset?.focusKey !== focusKey) {
      root.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
    }
    tips.refresh(); // a dica aberta acompanha a tabela nova (e a mão nova)
  }

  window.scrollTo(0, 0);
  beginTurn(`Modo ${mode.name}`);

  return {
    applyRemote,
    resync,
    destroy() {
      if (!destroyed) destroy();
    },
  };
}
