/**
 * Salas no Firestore (rooms/{code}). Toda gravação que muda o jogo é feita com
 * transação, conferindo o `rev` (ver roomState.js e firestore.rules).
 *
 * Toda gravação também atualiza o meu lastSeen (presence) e, as que mudam o
 * jogo, o `expireAt` (agora + 24 h). Assim o heartbeat só precisa gravar
 * quando o jogador ficou parado (ver `msSinceLastWrite`).
 */
import { Timestamp, doc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { generateRoomCode } from './roomCode.js';
import {
  JOIN_ERROR_MESSAGES,
  expireAtMillis,
  isMember,
  joinError,
  newRoomDoc,
  otherUid,
  rematchGame,
  rematchInfo,
  startingGame,
  toGameDoc,
} from './roomState.js';

const MAX_CODE_ATTEMPTS = 10;

const roomRef = (code) => doc(db, 'rooms', code);

/** Vencimento a gravar: agora + 24 h (as regras aceitam de 12 h a 36 h, por causa do relógio local). */
const freshExpireAt = () => Timestamp.fromMillis(expireAtMillis(Date.now()));

/** Última gravação minha em cada sala (para pular heartbeats desnecessários). */
const lastWriteAt = new Map();
const markWrite = (code) => lastWriteAt.set(code, Date.now());

export function msSinceLastWrite(code) {
  const at = lastWriteAt.get(code);
  return at === undefined ? Infinity : Date.now() - at;
}

/** Erro com mensagem para o jogador (`code`: 'not_found', 'full', …). */
export class RoomError extends Error {
  constructor(code, message = JOIN_ERROR_MESSAGES[code]) {
    super(message ?? 'Não foi possível concluir. Tente de novo.');
    this.code = code;
  }
}

/** O `rev` (ou a vez) mudou no meio: a jogada local é descartada. */
export class ConflictError extends Error {
  constructor(room) {
    super('A partida mudou no servidor');
    this.room = room;
  }
}

const isDenied = (error) => error?.code === 'permission-denied';

/** Erros que significam "sem internet / servidor fora do alcance". */
export function isNetworkError(error) {
  return ['unavailable', 'deadline-exceeded', 'auth/network-request-failed'].includes(error?.code) ||
    (typeof navigator !== 'undefined' && navigator.onLine === false);
}

/** Mensagem em português para erros do Firestore. */
export function roomErrorMessage(error) {
  if (error instanceof RoomError) return error.message;
  if (isNetworkError(error)) {
    return 'Sem conexão com a internet. Verifique a rede; o jogo tenta de novo sozinho quando ela voltar.';
  }
  switch (error?.code) {
    case 'permission-denied':
      return 'O servidor recusou essa ação. (Se acabou de publicar as regras, recarregue a página.)';
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo.';
    case 'resource-exhausted':
      return 'O limite diário gratuito do servidor acabou. Tente de novo amanhã.';
    default:
      return 'Algo deu errado. Tente de novo.';
  }
}

/**
 * Cria a sala com um código novo. A transação lê o código antes: se já existir
 * (ou for de uma partida de outros, que não dá para ler), tenta outro.
 */
export async function createRoom({ uid, name, modeId, timerEnabled }) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode(Math.random);
    const ref = roomRef(code);
    let free;
    try {
      free = await runTransaction(db, async (tx) => {
        let snap;
        try {
          snap = await tx.get(ref);
        } catch (error) {
          if (isDenied(error)) return false; // existe, em partida de outros
          throw error;
        }
        if (snap.exists()) return false;
        tx.set(ref, newRoomDoc({ uid, name, modeId, timerEnabled, now: serverTimestamp(), expireAt: freshExpireAt() }));
        return true;
      });
    } catch (error) {
      if (isDenied(error) && attempt < MAX_CODE_ATTEMPTS - 1) continue;
      throw error;
    }
    if (free) {
      markWrite(code);
      return code;
    }
  }
  throw new RoomError('no_code', 'Não foi possível gerar um código de sala. Tente de novo.');
}

/**
 * Entra na sala como convidado (ou volta para ela, se já for membro).
 * Lança RoomError com a mensagem certa: não existe, expirou, cheia, já começou…
 */
export async function joinRoom(code, { uid, name }) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    let snap;
    try {
      snap = await tx.get(ref);
    } catch (error) {
      // as regras só deixam quem não é membro ler salas em espera
      if (isDenied(error)) throw new RoomError('closed', 'Essa sala já está em partida (ou terminou).');
      throw error;
    }
    const room = snap.exists() ? snap.data() : null;
    const problem = joinError(room, uid, Date.now());
    if (problem) throw new RoomError(problem);
    if (!isMember(room, uid)) {
      tx.update(ref, {
        guestUid: uid,
        [`players.${uid}`]: { name },
        [`presence.${uid}`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expireAt: freshExpireAt(),
      });
    }
  });
  markWrite(code);
}

/** Anfitrião começa a 1ª partida (quem começa é sorteado). */
export async function startMatch(code, uid) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(ref)).data();
    if (!room || room.status !== 'waiting') return;
    if (room.hostUid !== uid) throw new RoomError('not_host', 'Só quem criou a sala pode começar.');
    if (!room.guestUid) throw new RoomError('no_guest', 'Espere seu amigo entrar.');
    tx.update(ref, {
      status: 'playing',
      game: toGameDoc(startingGame(room, Math.random)),
      rev: room.rev + 1,
      match: 1,
      [`presence.${uid}`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expireAt: freshExpireAt(),
    });
  });
  markWrite(code);
}

/**
 * Grava o estado da partida (só o jogador da vez). Confere o `rev`: se mudou
 * no meio, lança ConflictError com a sala do servidor. Devolve o novo rev.
 */
export async function commitGame(code, uid, state, expectedRev) {
  const ref = roomRef(code);
  const rev = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (!room || room.rev !== expectedRev || room.status !== 'playing' || room.game?.currentUid !== uid) {
      throw new ConflictError(room ?? null);
    }
    tx.update(ref, {
      game: toGameDoc(state),
      rev: expectedRev + 1,
      status: state.status === 'finished' ? 'finished' : 'playing',
      [`presence.${uid}`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expireAt: freshExpireAt(),
    });
    return expectedRev + 1;
  });
  markWrite(code);
  return rev;
}

/**
 * Pede revanche. Se o outro já pediu, a mesma transação recomeça a partida
 * (começa quem não começou a anterior).
 */
export async function voteRematch(code, uid) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(ref)).data();
    if (!room || room.status !== 'finished') return;
    const { theirs } = rematchInfo(room, uid);
    const vote = {
      [`rematch.${uid}`]: room.match,
      [`presence.${uid}`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (!theirs) {
      tx.update(ref, vote);
      return;
    }
    tx.update(ref, {
      ...vote,
      status: 'playing',
      game: toGameDoc(rematchGame(room)),
      rev: room.rev + 1,
      match: room.match + 1,
      forfeitUid: null,
      expireAt: freshExpireAt(),
    });
  });
  markWrite(code);
}

/** Encerra por abandono (o outro sumiu há mais de 2 min; as regras conferem o horário). */
export async function forfeit(code, uid) {
  const ref = roomRef(code);
  await runTransaction(db, async (tx) => {
    const room = (await tx.get(ref)).data();
    if (!room || room.status !== 'playing') return;
    tx.update(ref, {
      status: 'finished',
      forfeitUid: otherUid(room, uid),
      [`presence.${uid}`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  markWrite(code);
}

/** Sinal de vida (lastSeen) do jogador na sala. */
export async function heartbeat(code, uid) {
  await updateDoc(roomRef(code), { [`presence.${uid}`]: serverTimestamp() });
  markWrite(code);
}

/**
 * Acompanha a sala em tempo real. `onRoom(room | null, { pending, fromCache })`,
 * onde `room` traz `code` e os horários pendentes vêm estimados. Com
 * includeMetadataChanges, também avisa quando a conexão cai ou volta
 * (`fromCache` muda) — mudanças só de metadados não contam como leitura.
 */
export function watchRoom(code, onRoom, onError) {
  return onSnapshot(
    roomRef(code),
    { includeMetadataChanges: true },
    (snap) => {
      const room = snap.exists() ? { code, ...snap.data({ serverTimestamps: 'estimate' }) } : null;
      onRoom(room, { pending: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache });
    },
    onError,
  );
}
