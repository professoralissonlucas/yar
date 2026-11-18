/**
 * Documento da sala no Firestore (rooms/{code}) — funções puras, sem Firebase.
 *
 * {
 *   hostUid, guestUid (null até o amigo entrar), players: { uid: { name } },
 *   mode, timerEnabled, status: 'waiting' | 'playing' | 'finished',
 *   createdAt, updatedAt, expireAt, rev, match, game, presence: { uid: Timestamp },
 *   rematch: { uid: match }, forfeitUid
 * }
 *
 * - `expireAt`: agora + 24 h, renovado a cada jogada. Salas expiradas não aceitam
 *   entrada e podem ser apagadas pela política de TTL do Firestore.
 *
 * - `game`: o estado de src/core/game.js (mesmo formato de createGame) +
 *   `currentUid` (o id do jogador da vez, para as regras de segurança).
 * - `rev`: sobe 1 a cada gravação que muda `game` (início, jogada, revanche).
 * - `match`: número da partida na sala (0 antes de começar).
 * - `rematch[uid] == match`: esse jogador pediu revanche da partida atual.
 * - `forfeitUid`: quem perdeu por abandono (a partida termina sem o core terminar).
 */
import { HAND_SIZE } from '../core/deck.js';
import { createGame, getCurrentPlayer, getTotals, getWinners } from '../core/game.js';
import { getMode } from '../core/modes.js';

export const ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Validade da sala a partir da última jogada (campo expireAt). */
export const ROOM_TTL_MS = ROOM_MAX_AGE_MS;
/** Sinal de vida (lastSeen); pulado se o jogador gravou algo nesse intervalo. */
export const PRESENCE_INTERVAL_MS = 30 * 1000;
export const AWAY_AFTER_MS = 60 * 1000;
export const FORFEIT_AFTER_MS = 2 * 60 * 1000;

/** Timestamp do Firestore, Date, número ou null → milissegundos (ou null). */
export function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

/** Quando a sala expira se a última atividade foi agora (milissegundos). */
export function expireAtMillis(nowMs) {
  return nowMs + ROOM_TTL_MS;
}

/**
 * Campos da sala nova. `now` é o horário a gravar (serverTimestamp() no
 * Firebase) e `expireAt` o vencimento (Timestamp de agora + 24 h).
 */
export function newRoomDoc({ uid, name, modeId, timerEnabled, now, expireAt }) {
  getMode(modeId); // lança se o modo não existir
  return {
    hostUid: uid,
    guestUid: null,
    players: { [uid]: { name } },
    mode: modeId,
    timerEnabled: Boolean(timerEnabled),
    status: 'waiting',
    createdAt: now,
    updatedAt: now,
    expireAt,
    rev: 0,
    match: 0,
    game: null,
    presence: { [uid]: now },
    rematch: {},
    forfeitUid: null,
  };
}

export const isMember = (room, uid) => Boolean(uid) && (room.hostUid === uid || room.guestUid === uid);

export function otherUid(room, uid) {
  return room.hostUid === uid ? room.guestUid : room.hostUid;
}

export const playerName = (room, uid) => room.players?.[uid]?.name ?? 'Jogador';

/**
 * Pode entrar nesta sala? `null` = pode (ou já é membro e volta para ela).
 * Senão: 'not_found' | 'expired' | 'full' | 'started' | 'finished'. Sala
 * expirada é ignorada até por quem é membro.
 */
export function joinError(room, uid, nowMs) {
  if (!room) return 'not_found';
  if (isExpired(room, nowMs)) return 'expired';
  if (isMember(room, uid)) return null;
  if (room.status === 'playing') return 'started';
  if (room.status === 'finished') return 'finished';
  if (room.guestUid) return 'full';
  return null;
}

/** Sala vencida: expireAt no passado (salas antigas sem o campo: updatedAt + 24 h). */
export function isExpired(room, nowMs) {
  const expire = toMillis(room.expireAt);
  if (expire !== null) return nowMs > expire;
  const updated = toMillis(room.updatedAt);
  return updated !== null && nowMs - updated > ROOM_MAX_AGE_MS;
}

export const JOIN_ERROR_MESSAGES = {
  not_found: 'Essa sala não existe. Confira o código.',
  full: 'Essa sala já está cheia.',
  started: 'A partida dessa sala já começou.',
  finished: 'A partida dessa sala já terminou.',
  expired: 'Essa sala expirou (mais de 24 h sem jogadas). Crie outra ou peça um código novo.',
  invalid: 'O código tem 6 caracteres (letras e números).',
};

/** Situação do outro jogador pelo último sinal de vida (lastSeen). */
export function presenceStatus(lastSeenMs, nowMs) {
  if (lastSeenMs == null) return 'online'; // ainda não mandou o 1º sinal
  const elapsed = nowMs - lastSeenMs;
  if (elapsed > FORFEIT_AFTER_MS) return 'gone';
  if (elapsed > AWAY_AFTER_MS) return 'away';
  return 'online';
}

/**
 * Relógio do servidor estimado a partir do meu próprio lastSeen: cada vez que
 * um sinal meu é confirmado (valor novo), offset = horário do servidor − agora.
 * Assim a conta "o outro sumiu há quanto tempo" não depende do relógio local.
 */
export function createServerClock(localNow = () => Date.now()) {
  let offset = 0;
  let lastSeen = null;
  return {
    observe(serverMs) {
      if (serverMs == null || serverMs === lastSeen) return;
      lastSeen = serverMs;
      offset = serverMs - localNow();
    },
    now: () => localNow() + offset,
  };
}

/** Estado do core → campo `game` do Firestore. */
export function toGameDoc(state) {
  return { ...state, currentUid: getCurrentPlayer(state).id };
}

/** Campo `game` do Firestore → estado do core (valida a forma; lança se estiver estranho). */
export function fromGameDoc(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('Partida sem estado');
  const { currentUid, ...state } = doc;
  const { players, turn, scores } = state;
  const ok =
    Array.isArray(players) &&
    players.length === 2 &&
    Array.isArray(state.categories) &&
    Number.isInteger(state.currentPlayerIndex) &&
    players[state.currentPlayerIndex]?.id === currentUid &&
    Boolean(turn) &&
    Array.isArray(turn.deck) &&
    Array.isArray(turn.hand) &&
    Array.isArray(turn.locked) &&
    turn.locked.length === HAND_SIZE &&
    Number.isInteger(turn.drawsUsed) &&
    Boolean(scores) &&
    players.every((p) => scores[p.id] && typeof scores[p.id] === 'object') &&
    (state.status === 'playing' || state.status === 'finished');
  if (!ok) throw new Error('Estado da partida inválido');
  return { ...state, lastScored: state.lastScored ?? null };
}

/** Jogadores da sala (anfitrião primeiro) no formato do core. */
function roomPlayers(room) {
  return [room.hostUid, room.guestUid].map((id) => ({ id, name: playerName(room, id) }));
}

/** 1ª partida: quem começa é sorteado. */
export function startingGame(room, rng) {
  if (!room.guestUid) throw new Error('A sala ainda não tem dois jogadores');
  const players = roomPlayers(room);
  const starter = Math.floor(rng() * players.length);
  return createGame({ modeId: room.mode, players: [...players.slice(starter), ...players.slice(0, starter)] });
}

/** Revanche: começa quem não começou a partida anterior. */
export function rematchGame(room) {
  const players = roomPlayers(room);
  const previousStarter = room.game?.players?.[0]?.id;
  const ordered = previousStarter === players[0].id ? [players[1], players[0]] : players;
  return createGame({ modeId: room.mode, players: ordered });
}

/** Votos de revanche da partida atual. */
export function rematchInfo(room, uid) {
  const votes = room.rematch ?? {};
  const voted = (id) => Boolean(id) && votes[id] === room.match;
  return { mine: voted(uid), theirs: voted(otherUid(room, uid)) };
}

/**
 * Resultado da sala terminada: `{ winnerIds, isTie, totals, forfeitUid }`.
 * Com abandono, vence quem ficou (mesmo que o core não tenha terminado).
 */
export function roomResult(room) {
  const state = fromGameDoc(room.game);
  if (room.forfeitUid) {
    const winner = otherUid(room, room.forfeitUid);
    return { winnerIds: [winner], isTie: false, totals: getTotals(state), forfeitUid: room.forfeitUid };
  }
  return { ...getWinners(state), forfeitUid: null };
}
