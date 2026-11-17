/**
 * Estado da partida. Todas as funções são puras: nunca alteram o estado
 * recebido, sempre devolvem um novo. Jogadas inválidas lançam Error.
 *
 * Formato do estado:
 * {
 *   modeId, maxDraws, categories, deckCopiesPerValue,
 *   players: [{ id, name }],
 *   currentPlayerIndex, round,
 *   turn: { deck, hand, locked, drawsUsed },
 *   scores: { [playerId]: { [categoryId]: number | null } },
 *   status: 'playing' | 'finished',
 *   lastScored: { playerId, categoryId, points } | null,
 * }
 */

import { createDeck, drawCards, shuffle, DECK_COPIES_PER_VALUE, HAND_SIZE } from './deck.js';
import { CATEGORY_IDS, scoreHand } from './scoring.js';
import { getMode } from './modes.js';

function emptyTurn() {
  return {
    deck: [],
    hand: [],
    locked: Array(HAND_SIZE).fill(false),
    drawsUsed: 0,
  };
}

function assertPlaying(state) {
  if (state.status !== 'playing') throw new Error('A partida já terminou');
}

/** Cria uma nova partida. `players` é uma lista de `{ id, name }` (ordem = ordem dos turnos). */
export function createGame({ modeId, players, deckCopiesPerValue = DECK_COPIES_PER_VALUE }) {
  const mode = getMode(modeId);
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error('A partida precisa de pelo menos um jogador');
  }
  const ids = players.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('Ids de jogadores repetidos');

  const scores = {};
  for (const id of ids) {
    scores[id] = Object.fromEntries(mode.categories.map((c) => [c, null]));
  }

  return {
    modeId: mode.id,
    maxDraws: mode.maxDraws,
    categories: [...mode.categories],
    deckCopiesPerValue,
    players: players.map((p) => ({ id: p.id, name: p.name })),
    currentPlayerIndex: 0,
    round: 0,
    turn: emptyTurn(),
    scores,
    status: 'playing',
    lastScored: null,
  };
}

export function getCurrentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

/** Categorias ainda vazias de um jogador (padrão: o jogador da vez), na ordem do modo. */
export function getEmptyCategories(state, playerId = getCurrentPlayer(state).id) {
  const playerScores = state.scores[playerId];
  if (!playerScores) throw new Error(`Jogador desconhecido: ${playerId}`);
  return state.categories.filter((c) => playerScores[c] === null);
}

export function canDraw(state) {
  const { turn } = state;
  return (
    state.status === 'playing' &&
    turn.drawsUsed < state.maxDraws &&
    (turn.drawsUsed === 0 || turn.locked.some((l) => !l))
  );
}

/**
 * Tira cartas. Na 1ª tirada do turno embaralha um baralho novo e dá 5 cartas;
 * nas seguintes troca só as cartas não trancadas. Cartas descartadas não voltam.
 */
export function draw(state, rng) {
  assertPlaying(state);
  const { turn } = state;
  if (turn.drawsUsed >= state.maxDraws) {
    throw new Error(`Limite de ${state.maxDraws} tiradas atingido`);
  }

  if (turn.drawsUsed === 0) {
    const fresh = shuffle(createDeck(state.deckCopiesPerValue), rng);
    const { drawn, deck } = drawCards(fresh, HAND_SIZE);
    return {
      ...state,
      turn: { deck, hand: drawn, locked: Array(HAND_SIZE).fill(false), drawsUsed: 1 },
    };
  }

  const unlocked = turn.locked.flatMap((isLocked, i) => (isLocked ? [] : [i]));
  if (unlocked.length === 0) throw new Error('Todas as cartas estão trancadas');

  const { drawn, deck } = drawCards(turn.deck, unlocked.length);
  const hand = [...turn.hand];
  unlocked.forEach((handIndex, k) => {
    hand[handIndex] = drawn[k];
  });

  return {
    ...state,
    turn: { ...turn, deck, hand, locked: [...turn.locked], drawsUsed: turn.drawsUsed + 1 },
  };
}

/** Tranca/destranca a carta na posição `index` (0–4). Só depois da 1ª tirada. */
export function toggleLock(state, index) {
  assertPlaying(state);
  if (state.turn.drawsUsed === 0) throw new Error('Tire as cartas antes de trancar');
  if (!Number.isInteger(index) || index < 0 || index >= HAND_SIZE) {
    throw new RangeError(`Posição de carta inválida: ${index}`);
  }
  const locked = [...state.turn.locked];
  locked[index] = !locked[index];
  return { ...state, turn: { ...state.turn, locked } };
}

/** Pontos que a mão atual daria em cada categoria vazia do jogador da vez. */
export function getScoreOptions(state) {
  if (state.turn.drawsUsed === 0) return {};
  const all = scoreHand(state.turn.hand);
  return Object.fromEntries(getEmptyCategories(state).map((c) => [c, all[c]]));
}

export function canScore(state, categoryId) {
  return (
    state.status === 'playing' &&
    state.turn.drawsUsed > 0 &&
    state.categories.includes(categoryId) &&
    state.scores[getCurrentPlayer(state).id][categoryId] === null
  );
}

function allFilled(scores) {
  return Object.values(scores).every((playerScores) =>
    Object.values(playerScores).every((v) => v !== null),
  );
}

/**
 * Marca a mão atual na categoria escolhida (0 pontos = zerar) e passa a vez.
 * Se todos preencheram todas as categorias, a partida termina.
 */
export function scoreTurn(state, categoryId) {
  assertPlaying(state);
  if (state.turn.drawsUsed === 0) throw new Error('Tire as cartas antes de marcar');
  if (!state.categories.includes(categoryId)) {
    throw new Error(`A categoria ${categoryId} não faz parte deste modo`);
  }
  const player = getCurrentPlayer(state);
  if (state.scores[player.id][categoryId] !== null) {
    throw new Error(`A categoria ${categoryId} já foi marcada`);
  }

  const points = scoreHand(state.turn.hand)[categoryId];
  const scores = {
    ...state.scores,
    [player.id]: { ...state.scores[player.id], [categoryId]: points },
  };
  const finished = allFilled(scores);
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;

  return {
    ...state,
    scores,
    turn: emptyTurn(),
    currentPlayerIndex: finished ? state.currentPlayerIndex : nextIndex,
    round: !finished && nextIndex === 0 ? state.round + 1 : state.round,
    status: finished ? 'finished' : 'playing',
    lastScored: { playerId: player.id, categoryId, points },
  };
}

/**
 * Categoria marcada automaticamente quando o tempo acaba: a vazia de maior
 * pontuação; em empate (inclusive quando todas dão 0), a de menor potencial,
 * isto é, a primeira na ordem de CATEGORIES (Uns, Dois, …).
 */
export function chooseTimeoutCategory(state) {
  const options = getScoreOptions(state);
  const candidates = Object.keys(options).sort(
    (a, b) => options[b] - options[a] || CATEGORY_IDS.indexOf(a) - CATEGORY_IDS.indexOf(b),
  );
  if (candidates.length === 0) throw new Error('Não há categoria disponível');
  return candidates[0];
}

/** Tempo esgotado: tira as cartas se ainda não tirou e marca a categoria automática. */
export function applyTimeout(state, rng) {
  assertPlaying(state);
  const ready = state.turn.drawsUsed === 0 ? draw(state, rng) : state;
  return scoreTurn(ready, chooseTimeoutCategory(ready));
}

/** Soma dos pontos de cada jogador: `{ [playerId]: total }`. */
export function getTotals(state) {
  return Object.fromEntries(
    state.players.map((p) => [
      p.id,
      Object.values(state.scores[p.id]).reduce((sum, v) => sum + (v ?? 0), 0),
    ]),
  );
}

export function isGameOver(state) {
  return state.status === 'finished';
}

/** Vencedor(es) da partida finalizada: `{ winnerIds, isTie, totals }`. */
export function getWinners(state) {
  if (!isGameOver(state)) throw new Error('A partida ainda não terminou');
  const totals = getTotals(state);
  const best = Math.max(...Object.values(totals));
  const winnerIds = state.players.map((p) => p.id).filter((id) => totals[id] === best);
  return { winnerIds, isTie: winnerIds.length > 1, totals };
}
