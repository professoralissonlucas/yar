/**
 * Salas no Firestore (rooms/{code}). Toda gravação que muda o jogo é feita com
 * transação, conferindo o `rev` (ver roomState.js e firestore.rules).
 */
import { doc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { generateRoomCode } from './roomCode.js';
import {
  JOIN_ERROR_MESSAGES,
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

/** Mensagem em português para erros do Firestore. */
export function roomErrorMessage(error) {
  if (error instanceof RoomError) return error.message;
  switch (error?.code) {
    case 'permission-denied':
      return 'Sem permissão para essa sala. (As regras do Firestore foram publicadas?)';
    case 'unavailable':
      return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo.';
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
        tx.set(ref, newRoomDoc({ uid, name, modeId, timerEnabled, now: serverTimestamp() }));
        return true;
      });
    } catch (error) {
      if (isDenied(error) && attempt < MAX_CODE_ATTEMPTS - 1) continue;
      throw error;
    }
    if (free) return code;
  }
  throw new RoomError('no_code', 'Não foi possível gerar um código de sala. Tente de novo.');
}

/**
 * Entra na sala como convidado (ou volta para ela, se já for membro).
 * Lança RoomError com a mensagem certa: não existe, cheia, já começou…
 */
export function joinRoom(code, { uid, name }) {
  const ref = roomRef(code);
  return runTransaction(db, async (tx) => {
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
      });
    }
  });
}

/** Anfitrião começa a 1ª partida (quem começa é sorteado). */
export function startMatch(code, uid) {
  const ref = roomRef(code);
  return runTransaction(db, async (tx) => {
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
    });
  });
}

/**
 * Grava o estado da partida (só o jogador da vez). Confere o `rev`: se mudou
 * no meio, lança ConflictError com a sala do servidor. Devolve o novo rev.
 */
export function commitGame(code, uid, state, expectedRev) {
  const ref = roomRef(code);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (!room || room.rev !== expectedRev || room.status !== 'playing' || room.game?.currentUid !== uid) {
      throw new ConflictError(room ?? null);
    }
    const rev = expectedRev + 1;
    tx.update(ref, {
      game: toGameDoc(state),
      rev,
      status: state.status === 'finished' ? 'finished' : 'playing',
      [`presence.${uid}`]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return rev;
  });
}

/**
 * Pede revanche. Se o outro já pediu, a mesma transação recomeça a partida
 * (começa quem não começou a anterior).
 */
export function voteRematch(code, uid) {
  const ref = roomRef(code);
  return runTransaction(db, async (tx) => {
    const room = (await tx.get(ref)).data();
    if (!room || room.status !== 'finished') return;
    const { theirs } = rematchInfo(room, uid);
    const vote = { [`rematch.${uid}`]: room.match, updatedAt: serverTimestamp() };
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
    });
  });
}

/** Encerra por abandono (o outro sumiu há mais de 2 min; as regras conferem o horário). */
export function forfeit(code, uid) {
  const ref = roomRef(code);
  return runTransaction(db, async (tx) => {
    const room = (await tx.get(ref)).data();
    if (!room || room.status !== 'playing') return;
    tx.update(ref, {
      status: 'finished',
      forfeitUid: otherUid(room, uid),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Sinal de vida (lastSeen) do jogador na sala. */
export function heartbeat(code, uid) {
  return updateDoc(roomRef(code), { [`presence.${uid}`]: serverTimestamp() });
}

/**
 * Acompanha a sala em tempo real. `onRoom(room | null, { pending })`, onde
 * `room` traz `code` e os horários pendentes vêm estimados.
 */
export function watchRoom(code, onRoom, onError) {
  return onSnapshot(
    roomRef(code),
    (snap) => {
      const room = snap.exists() ? { code, ...snap.data({ serverTimestamps: 'estimate' }) } : null;
      onRoom(room, { pending: snap.metadata.hasPendingWrites });
    },
    onError,
  );
}
