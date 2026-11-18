/**
 * Ajudantes dos testes das regras no emulador do Firestore.
 *
 * As ações fazem as MESMAS transações de src/online/rooms.js, com os mesmos
 * objetos gravados (joinPayload, movePayload… de src/online/roomState.js);
 * só trocam o `db` do app pelo de um usuário de teste (host, guest…).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  expireAtMillis,
  forfeitPayload,
  heartbeatPayload,
  isMember,
  joinError,
  joinPayload,
  movePayload,
  newRoomDoc,
  rematchPayload,
  startPayload,
  startingGame,
} from '../../src/online/roomState.js';
import { plannedWrites, sameStep } from '../../src/online/pushQueue.js';
import { playLikeTheTable } from '../online/playScript.js';

export const PROJECT_ID = 'demo-yar';
export const HOST = 'host-uid';
export const GUEST = 'guest-uid';
export const STRANGER = 'stranger-uid';
export const NAMES = { [HOST]: 'Ana', [GUEST]: 'Bia', [STRANGER]: 'Caio' };

const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

let env = null;
const dbs = new Map();

/**
 * Regras com `extra` expressões a mais em toda gravação (`true && true && …`
 * antes do update e do create). Serve para provar que as jogadas legítimas
 * têm folga até o limite de 1000 expressões do Firestore.
 */
export function rulesWithPadding(extra) {
  if (!extra) return RULES;
  // uma cadeia longa demais não compila ("too complex"): blocos de 20
  const CHUNK = 20;
  const chunks = Math.ceil(extra / CHUNK);
  let pad = '';
  for (let i = 0; i < chunks; i++) {
    const size = Math.min(CHUNK, extra - i * CHUNK);
    pad += `function folga${i}() { return ${Array(size).fill('true').join(' && ')}; }\n      `;
  }
  pad += `function folga() { return ${Array.from({ length: chunks }, (_, i) => `folga${i}()`).join(' && ')}; }\n\n      `;
  const out = RULES.replace('allow update: if signedIn() &&', 'allow update: if folga() && signedIn() &&')
    .replace('allow create: if signedIn() &&', 'allow create: if folga() && signedIn() &&')
    .replace('function roomUpdate(', `${pad}function roomUpdate(`);
  if (out.split('folga()').length !== 4) throw new Error('rulesWithPadding: marcadores não encontrados no .rules');
  return out;
}

export async function setupEnv({ padding = 0 } = {}) {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: rulesWithPadding(padding) } });
  return env;
}

export async function teardownEnv() {
  await saveCoverage();
  await env?.cleanup();
  env = null;
  dbs.clear();
}

export const clearDb = () => env.clearFirestore();

/** Firestore como o usuário `uid` (null = sem login). */
export function dbAs(uid) {
  const key = uid ?? '(anon)';
  if (!dbs.has(key)) {
    const ctx = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
    dbs.set(key, ctx.firestore());
  }
  return dbs.get(key);
}

const ref = (uid, code) => doc(dbAs(uid), 'rooms', code);
const freshExpireAt = () => Timestamp.fromMillis(expireAtMillis(Date.now()));

/** Sala como está gravada (sem regras). */
export async function readRoom(code) {
  let data = null;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), 'rooms', code));
    data = snap.exists() ? snap.data() : null;
  });
  return data;
}

/** Grava a sala direto (sem regras), para montar casos. */
export async function seedRoom(code, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'rooms', code), data);
  });
}

/** Muda campos da sala direto (sem regras), ex.: presença antiga para testar abandono. */
export async function patchRoom(code, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'rooms', code), data);
  });
}

/** Mesmas ações de rooms.js. */
export async function createRoom(uid, { code = 'ABCDEF', modeId = 'odd', timerEnabled = false } = {}) {
  await runTransaction(dbAs(uid), async (tx) => {
    const snap = await tx.get(ref(uid, code));
    if (snap.exists()) throw new Error('código em uso');
    tx.set(
      ref(uid, code),
      newRoomDoc({ uid, name: NAMES[uid], modeId, timerEnabled, now: serverTimestamp(), expireAt: freshExpireAt() }),
    );
  });
  return code;
}

export async function joinRoom(code, uid) {
  await runTransaction(dbAs(uid), async (tx) => {
    const snap = await tx.get(ref(uid, code));
    const room = snap.exists() ? snap.data() : null;
    const problem = joinError(room, uid, Date.now());
    if (problem) throw new Error(`não pode entrar: ${problem}`);
    if (!isMember(room, uid)) {
      tx.update(ref(uid, code), joinPayload({ uid, name: NAMES[uid], now: serverTimestamp(), expireAt: freshExpireAt() }));
    }
  });
}

/** Começa a partida; `rng` decide quem começa. Devolve o estado do core. */
export async function startMatch(code, uid, rng = () => 0) {
  let game = null;
  await runTransaction(dbAs(uid), async (tx) => {
    const room = (await tx.get(ref(uid, code))).data();
    game = startingGame(room, rng);
    tx.update(ref(uid, code), startPayload(room, { uid, game, now: serverTimestamp(), expireAt: freshExpireAt() }));
  });
  return game;
}

/** Grava uma jogada (commitGame). Devolve o novo rev. */
export async function commit(code, uid, state, expectedRev, mutate = null) {
  await runTransaction(dbAs(uid), async (tx) => {
    const room = (await tx.get(ref(uid, code))).data();
    if (room.rev !== expectedRev) throw new Error(`rev mudou: ${room.rev} ≠ ${expectedRev}`);
    const payload = movePayload({ uid, state, expectedRev, now: serverTimestamp(), expireAt: freshExpireAt() });
    if (mutate) {
      payload.game = structuredClone(payload.game); // não mexe nos estados do core
      mutate(payload); // trapaças: mexe no objeto antes de gravar
    }
    tx.update(ref(uid, code), payload);
  });
  return expectedRev + 1;
}

export async function voteRematch(code, uid) {
  await runTransaction(dbAs(uid), async (tx) => {
    const room = (await tx.get(ref(uid, code))).data();
    tx.update(ref(uid, code), rematchPayload(room, { uid, now: serverTimestamp(), expireAt: freshExpireAt() }));
  });
}

export async function forfeit(code, uid) {
  await runTransaction(dbAs(uid), async (tx) => {
    const room = (await tx.get(ref(uid, code))).data();
    tx.update(ref(uid, code), forfeitPayload(room, { uid, now: serverTimestamp() }));
  });
}

export const heartbeat = (code, uid) => updateDoc(ref(uid, code), heartbeatPayload({ uid, now: serverTimestamp() }));

/** Gravação qualquer (trapaças). */
export const rawUpdate = (code, uid, data) => updateDoc(ref(uid, code), data);

export const readAs = (code, uid) => getDoc(ref(uid, code));

export { serverTimestamp, Timestamp, freshExpireAt };

/** Sala pronta: criada pelo anfitrião, com o convidado dentro e a partida começada. */
export async function playingRoom({ code = 'ABCDEF', modeId = 'odd', starter = 0 } = {}) {
  await createRoom(HOST, { code, modeId });
  await joinRoom(code, GUEST);
  const game = await startMatch(code, HOST, () => starter / 2);
  return { code, game, rev: 1 };
}

/** Que jogada é a gravação de `prev` para `next` (para mensagens de erro). */
export function moveKind(prev, next) {
  if (next.turn.drawsUsed === 0) return `marcação de ${next.lastScored?.categoryId}`;
  if (next.turn.drawsUsed === prev.turn.drawsUsed) return 'cadeado';
  return `${next.turn.drawsUsed}ª tirada`;
}

/**
 * Grava, pelo jogador da vez, cada estado que a mesa mandaria gravar numa
 * partida inteira (roteiro de tests/online/playScript.js), até o fim. Com
 * `merge`, junta cliques de cadeado como a fila faria. Devolve { state, rev }.
 */
export async function playWholeMatch(code, start, rev, { seed, merge = false, label = '' }) {
  const pushed = playLikeTheTable(start, seed);
  const writes = merge ? plannedWrites(pushed, sameStep) : pushed;
  let prev = start;
  for (const [i, next] of writes.entries()) {
    const writer = prev.players[prev.currentPlayerIndex].id;
    try {
      rev = await commit(code, writer, next, rev);
    } catch (error) {
      throw new Error(`${label} gravação nº ${i + 1} (${moveKind(prev, next)}) recusada: ${error.message}`);
    }
    prev = next;
  }
  return { state: prev, rev };
}

/** Relatório de cobertura das regras (valor de cada expressão), para diagnóstico. */
async function saveCoverage() {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  try {
    const res = await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}:ruleCoverage.html`);
    if (!res.ok) return;
    const dir = new URL('../../coverage/', import.meta.url);
    mkdirSync(dir, { recursive: true });
    writeFileSync(new URL('rules-coverage.html', dir), await res.text());
  } catch {
    // sem relatório: tudo bem
  }
}
