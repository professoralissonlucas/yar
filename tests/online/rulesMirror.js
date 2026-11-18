/**
 * Espelho em JavaScript das regras de jogada do firestore.rules (validMove,
 * newGameOk e auxiliares). Usado só nos testes, para provar rápido que a
 * sequência que o cliente grava passa nas regras e que trapaças comuns são
 * recusadas. Mantenha igual ao firestore.rules (as tabelas são conferidas
 * por teste).
 *
 * O espelho NÃO enxerga o limite de 1000 expressões por gravação do
 * Firestore (foi ele que recusou a 2ª tirada depois da Fase 7). Isso só os
 * testes no emulador pegam: `npm run test:rules` (tests/rules/).
 */
import { CATEGORIES } from '../../src/core/scoring.js';
import { MODES } from '../../src/core/modes.js';

const MODE_TABLE = Object.fromEntries(MODES.map((m) => [m.id, { draws: m.maxDraws, cats: m.categories }]));
const RANGE = Object.fromEntries(CATEGORIES.map((c) => [c.id, [c.min, c.max]]));
const GAME_KEYS = ['modeId', 'maxDraws', 'categories', 'deckCopiesPerValue', 'players', 'currentPlayerIndex',
  'round', 'turn', 'scores', 'status', 'lastScored', 'currentUid'];
const TURN_KEYS = ['deck', 'hand', 'locked', 'drawsUsed'];
const EMPTY_TURN = { deck: [], hand: [], locked: [false, false, false, false, false], drawsUsed: 0 };

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameKeys = (obj, keys) => {
  const k = Object.keys(obj);
  return k.length === keys.length && keys.every((x) => k.includes(x));
};
const isInt = Number.isInteger;
const only = (list, allowed) => list.every((v) => allowed.includes(v));

/** Chaves que mudaram (adicionadas, removidas ou alteradas) — como map.diff().affectedKeys(). */
const affectedKeys = (n, s) =>
  [...new Set([...Object.keys(n), ...Object.keys(s)])].filter((k) => !(k in n) || !(k in s) || !eq(n[k], s[k]));
const affectsOnly = (n, s, keys) => affectedKeys(n, s).every((k) => keys.includes(k));

const handOk = (h) => Array.isArray(h) && h.length === 5 && only(h, [1, 2, 3, 4, 5, 6]);
const locksOk = (l) => Array.isArray(l) && l.length === 5 && only(l, [true, false]);

/** Forma geral do `game` (o que as regras garantem de qualquer game gravado). */
export function gameShapeOk(g) {
  const t = g.turn;
  const l = g.lastScored;
  return (
    sameKeys(g, GAME_KEYS) &&
    Array.isArray(g.players) && g.players.length === 2 &&
    [0, 1].includes(g.currentPlayerIndex) &&
    g.currentUid === g.players[g.currentPlayerIndex].id &&
    isInt(g.round) && g.round >= 0 &&
    ['playing', 'finished'].includes(g.status) &&
    sameKeys(t, TURN_KEYS) && isInt(t.drawsUsed) &&
    (eq(t, EMPTY_TURN) ||
      (t.drawsUsed >= 1 && t.drawsUsed <= g.maxDraws && handOk(t.hand) && locksOk(t.locked) &&
        Array.isArray(t.deck) && only(t.deck, [1, 2, 3, 4, 5, 6]) && t.deck.length <= 31)) &&
    (l === null ||
      (sameKeys(l, ['playerId', 'categoryId', 'points']) &&
        typeof l.playerId === 'string' && typeof l.categoryId === 'string' && isInt(l.points)))
  );
}

const freshScores = (scores, cats) => sameKeys(scores, cats) && Object.values(scores).every((v) => v === null);

/**
 * `room`: { mode, hostUid, guestUid, players: { uid: { name } } } (a sala ANTES
 * da gravação). Na revanche as regras usam as tiradas/categorias do game
 * anterior, que são sempre as do modo — dá no mesmo que a tabela.
 */
export function newGameOk(g, room) {
  const mode = MODE_TABLE[room.mode];
  const playerOk = (p) =>
    sameKeys(p, ['id', 'name']) && [room.hostUid, room.guestUid].includes(p.id) && p.name === room.players[p.id].name;
  return (
    sameKeys(g, GAME_KEYS) &&
    g.modeId === room.mode &&
    g.maxDraws === mode.draws &&
    eq(g.categories, mode.cats) &&
    g.deckCopiesPerValue === 6 &&
    Array.isArray(g.players) && g.players.length === 2 &&
    playerOk(g.players[0]) && playerOk(g.players[1]) &&
    g.players[0].id !== g.players[1].id &&
    g.currentPlayerIndex === 0 &&
    g.currentUid === g.players[0].id &&
    g.round === 0 &&
    g.status === 'playing' &&
    eq(g.turn, EMPTY_TURN) &&
    g.lastScored === null &&
    sameKeys(g.scores, [room.hostUid, room.guestUid]) &&
    freshScores(g.scores[room.hostUid], mode.cats) &&
    freshScores(g.scores[room.guestUid], mode.cats)
  );
}

/** CADEADO: no game só o turno muda; no turno, só os cadeados. */
function lockMove(s, n) {
  return affectsOnly(n, s, ['turn']) && affectsOnly(n.turn, s.turn, ['locked']) && locksOk(n.turn.locked);
}

/** TIRADA: só o turno muda; drawsUsed +1 sem passar do limite; 1ª tirada ou troca das destrancadas. */
function drawMove(s, n) {
  const t = n.turn;
  const st = s.turn;
  if (
    !(affectsOnly(n, s, ['turn']) && affectsOnly(t, st, TURN_KEYS) &&
      t.drawsUsed === st.drawsUsed + 1 && t.drawsUsed <= s.maxDraws &&
      handOk(t.hand) && Array.isArray(t.deck) && only(t.deck, [1, 2, 3, 4, 5, 6]))
  ) {
    return false;
  }
  if (st.drawsUsed === 0) {
    return eq(t.locked, [false, false, false, false, false]) && t.deck.length === s.deckCopiesPerValue * 6 - 5;
  }
  const replaced = st.locked.filter((l) => !l).length;
  return (
    eq(t.locked, st.locked) &&
    replaced >= 1 &&
    [0, 1, 2, 3, 4].every((i) => !st.locked[i] || t.hand[i] === st.hand[i]) &&
    t.deck.length === st.deck.length - replaced
  );
}

/** MARCAÇÃO: uma categoria vazia do jogador da vez, na faixa; turno vazio; a vez passa (ou a partida termina). */
function scoreMove(s, n) {
  const player = s.currentUid;
  const other = s.players[1 - s.currentPlayerIndex].id;
  const last = n.lastScored;
  if (!last || typeof last !== 'object') return false;
  const cat = last.categoryId;
  const range = RANGE[cat];
  if (!range) return false;
  const allFilled =
    !Object.values(n.scores[player]).includes(null) && !Object.values(n.scores[other]).includes(null);
  return (
    s.turn.drawsUsed >= 1 &&
    affectsOnly(n, s, ['scores', 'turn', 'currentPlayerIndex', 'round', 'status', 'lastScored', 'currentUid']) &&
    eq(n.turn, EMPTY_TURN) &&
    only(Object.keys(last), ['playerId', 'categoryId', 'points']) &&
    last.playerId === player &&
    s.categories.includes(cat) &&
    isInt(last.points) && last.points >= range[0] && last.points <= range[1] &&
    s.scores[player][cat] === null &&
    affectsOnly(n.scores, s.scores, [player]) &&
    affectsOnly(n.scores[player], s.scores[player], [cat]) &&
    n.scores[player][cat] === last.points &&
    n.currentUid === n.players[n.currentPlayerIndex]?.id &&
    (allFilled
      ? n.status === 'finished' && n.currentPlayerIndex === s.currentPlayerIndex && n.round === s.round
      : n.status === 'playing' &&
        n.currentPlayerIndex === 1 - s.currentPlayerIndex &&
        n.round === (n.currentPlayerIndex === 0 ? s.round + 1 : s.round))
  );
}

/**
 * Jogada válida (s = game gravado, n = game novo; os dois já com currentUid).
 * Como nas regras: o drawsUsed novo diz qual jogada é (0 → marcação; igual →
 * cadeado; senão → tirada), e só ela é conferida.
 */
export function validMove(s, n) {
  if (s.status !== 'playing' || !n.turn) return false;
  if (n.turn.drawsUsed === 0) return scoreMove(s, n);
  return n.turn.drawsUsed === s.turn.drawsUsed ? lockMove(s, n) : drawMove(s, n);
}

export { MODE_TABLE, RANGE };
