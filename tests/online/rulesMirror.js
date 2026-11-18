/**
 * Espelho em JavaScript das regras de jogada do firestore.rules (validMove,
 * newGameOk e auxiliares). Usado só nos testes, para provar que a sequência
 * que o cliente grava passa nas regras e que trapaças comuns são recusadas.
 * Mantenha igual ao firestore.rules (as tabelas são conferidas por teste).
 */
import { CATEGORIES } from '../../src/core/scoring.js';
import { MODES } from '../../src/core/modes.js';

const MODE_TABLE = Object.fromEntries(MODES.map((m) => [m.id, { draws: m.maxDraws, cats: m.categories }]));
const RANGE = Object.fromEntries(CATEGORIES.map((c) => [c.id, [c.min, c.max]]));
const GAME_KEYS = ['modeId', 'maxDraws', 'categories', 'deckCopiesPerValue', 'players', 'currentPlayerIndex',
  'round', 'turn', 'scores', 'status', 'lastScored', 'currentUid'];
const TURN_KEYS = ['deck', 'hand', 'locked', 'drawsUsed'];

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameKeys = (obj, keys) => {
  const k = Object.keys(obj);
  return k.length === keys.length && keys.every((x) => k.includes(x));
};
const isInt = Number.isInteger;
const only = (list, allowed) => list.every((v) => allowed.includes(v));

function turnOk(g) {
  const t = g.turn;
  return (
    sameKeys(t, TURN_KEYS) &&
    isInt(t.drawsUsed) &&
    Array.isArray(t.hand) && only(t.hand, [1, 2, 3, 4, 5, 6]) &&
    Array.isArray(t.deck) && only(t.deck, [1, 2, 3, 4, 5, 6]) &&
    Array.isArray(t.locked) && t.locked.length === 5 && only(t.locked, [true, false]) &&
    ((t.drawsUsed === 0 && t.hand.length === 0 && t.deck.length === 0 && only(t.locked, [false])) ||
      (t.drawsUsed >= 1 && t.drawsUsed <= g.maxDraws && t.hand.length === 5 && t.deck.length <= 31))
  );
}

function lastScoredOk(g) {
  const l = g.lastScored;
  return (
    l === null ||
    (sameKeys(l, ['playerId', 'categoryId', 'points']) &&
      typeof l.playerId === 'string' && typeof l.categoryId === 'string' && isInt(l.points))
  );
}

export function gameShapeOk(g) {
  return (
    sameKeys(g, GAME_KEYS) &&
    Array.isArray(g.players) && g.players.length === 2 &&
    [0, 1].includes(g.currentPlayerIndex) &&
    g.currentUid === g.players[g.currentPlayerIndex].id &&
    isInt(g.round) && g.round >= 0 &&
    ['playing', 'finished'].includes(g.status) &&
    turnOk(g) &&
    lastScoredOk(g)
  );
}

const freshScores = (scores, cats) => sameKeys(scores, cats) && Object.values(scores).every((v) => v === null);

/** `room`: { mode, hostUid, guestUid, players: { uid: { name } } } (a sala ANTES da gravação). */
export function newGameOk(g, room) {
  const mode = MODE_TABLE[room.mode];
  const playerOk = (p) =>
    sameKeys(p, ['id', 'name']) && [room.hostUid, room.guestUid].includes(p.id) && p.name === room.players[p.id].name;
  return (
    gameShapeOk(g) &&
    g.modeId === room.mode &&
    g.maxDraws === mode.draws &&
    eq(g.categories, mode.cats) &&
    g.deckCopiesPerValue === 6 &&
    playerOk(g.players[0]) && playerOk(g.players[1]) &&
    g.players[0].id !== g.players[1].id &&
    g.currentPlayerIndex === 0 &&
    g.round === 0 &&
    g.status === 'playing' &&
    g.turn.drawsUsed === 0 &&
    g.lastScored === null &&
    sameKeys(g.scores, [room.hostUid, room.guestUid]) &&
    freshScores(g.scores[room.hostUid], mode.cats) &&
    freshScores(g.scores[room.guestUid], mode.cats)
  );
}

function gameFixedKept(s, n) {
  return (
    n.modeId === s.modeId &&
    n.maxDraws === s.maxDraws &&
    eq(n.categories, s.categories) &&
    n.deckCopiesPerValue === s.deckCopiesPerValue &&
    eq(n.players, s.players) &&
    sameKeys(n.scores, Object.keys(s.scores))
  );
}

function sameTurn(s, n) {
  return (
    n.currentPlayerIndex === s.currentPlayerIndex &&
    n.round === s.round &&
    n.status === 'playing' &&
    eq(n.scores, s.scores) &&
    eq(n.lastScored, s.lastScored)
  );
}

const unlockedCount = (t) => t.locked.filter((l) => !l).length;

function lockMove(s, n) {
  return (
    sameTurn(s, n) &&
    s.turn.drawsUsed >= 1 &&
    n.turn.drawsUsed === s.turn.drawsUsed &&
    eq(n.turn.hand, s.turn.hand) &&
    eq(n.turn.deck, s.turn.deck)
  );
}

function drawMove(s, n) {
  if (!(sameTurn(s, n) && n.turn.drawsUsed === s.turn.drawsUsed + 1 && n.turn.drawsUsed <= n.maxDraws)) return false;
  if (s.turn.drawsUsed === 0) {
    return n.turn.hand.length === 5 && only(n.turn.locked, [false]) && n.turn.deck.length === n.deckCopiesPerValue * 6 - 5;
  }
  const replaced = unlockedCount(s.turn);
  return (
    eq(n.turn.locked, s.turn.locked) &&
    replaced >= 1 &&
    [0, 1, 2, 3, 4].every((i) => !s.turn.locked[i] || n.turn.hand[i] === s.turn.hand[i]) &&
    n.turn.deck.length === s.turn.deck.length - replaced
  );
}

const allFilled = (scores, a, b) =>
  !Object.values(scores[a]).includes(null) && !Object.values(scores[b]).includes(null);

function scoreMove(s, n) {
  if (!(s.turn.drawsUsed >= 1 && n.lastScored !== null)) return false;
  const player = s.players[s.currentPlayerIndex].id;
  const other = s.players[1 - s.currentPlayerIndex].id;
  const { categoryId: cat, points } = n.lastScored;
  const changedKeys = Object.keys({ ...n.scores[player], ...s.scores[player] }).filter(
    (k) => !eq(n.scores[player][k], s.scores[player][k]),
  );
  return (
    n.lastScored.playerId === player &&
    n.categories.includes(cat) &&
    s.scores[player][cat] === null &&
    changedKeys.every((k) => k === cat) &&
    n.scores[player][cat] === points &&
    points >= RANGE[cat][0] && points <= RANGE[cat][1] &&
    eq(n.scores[other], s.scores[other]) &&
    n.turn.drawsUsed === 0 &&
    (allFilled(n.scores, player, other)
      ? n.status === 'finished' && n.currentPlayerIndex === s.currentPlayerIndex && n.round === s.round
      : n.status === 'playing' &&
        n.currentPlayerIndex === 1 - s.currentPlayerIndex &&
        n.round === (n.currentPlayerIndex === 0 ? s.round + 1 : s.round))
  );
}

/** Jogada válida (s = game gravado, n = game novo; os dois já com currentUid). */
export function validMove(s, n) {
  return gameShapeOk(n) && gameFixedKept(s, n) && (lockMove(s, n) || drawMove(s, n) || scoreMove(s, n));
}

export { MODE_TABLE, RANGE };
