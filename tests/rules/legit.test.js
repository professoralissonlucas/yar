/**
 * Jogadas legítimas: todas precisam ser ACEITAS pelas regras (emulador).
 * Rodar com `npm run test:rules`.
 */
import { assertSucceeds } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { draw, scoreTurn, toggleLock } from '../../src/core/game.js';
import { MODES } from '../../src/core/modes.js';
import { createSeededRng } from '../../src/core/rng.js';
import { fromGameDoc } from '../../src/online/roomState.js';
import {
  GUEST,
  HOST,
  STRANGER,
  Timestamp,
  clearDb,
  commit,
  createRoom,
  forfeit,
  heartbeat,
  joinRoom,
  patchRoom,
  playWholeMatch,
  playingRoom,
  readAs,
  readRoom,
  setupEnv,
  startMatch,
  teardownEnv,
  voteRematch,
} from './helpers.js';

beforeAll(() => setupEnv());
afterAll(teardownEnv);
beforeEach(clearDb);

/** Grava `next` e, se recusar, diz em qual passo. */
function stepper(code, startRev) {
  let rev = startRev;
  return {
    get rev() {
      return rev;
    },
    async step(label, uid, next) {
      try {
        rev = await assertSucceeds(commit(code, uid, next, rev));
      } catch (error) {
        throw new Error(`recusada em "${label}": ${error.message}`);
      }
      return next;
    },
  };
}

describe('o bug da Fase 7 (Ímpares, turno 1)', () => {
  it('1ª tirada → tranca 2 cartas (2 gravações) → 2ª tirada → marca', async () => {
    const { code, game } = await playingRoom({ modeId: 'odd' });
    const rng = createSeededRng(7);
    const w = stepper(code, 1);
    let s = await w.step('1ª tirada', HOST, draw(game, rng));
    s = await w.step('trancar carta 1', HOST, toggleLock(s, 0));
    s = await w.step('trancar carta 4', HOST, toggleLock(s, 3));
    s = await w.step('2ª tirada', HOST, draw(s, rng));
    s = await w.step('destrancar carta 1', HOST, toggleLock(s, 0));
    s = await w.step('3ª tirada', HOST, draw(s, rng));
    await w.step('marcar Chance', HOST, scoreTurn(s, 'chance'));
    const room = await readRoom(code);
    expect(room.rev).toBe(w.rev);
    expect(room.game.currentUid).toBe(GUEST);
    expect(room.game.scores[HOST].chance).toBeGreaterThanOrEqual(5);
  });

  it('trancar e destrancar a mesma carta (o game volta ao gravado; só o rev sobe)', async () => {
    const { code, game } = await playingRoom({ modeId: 'odd' });
    const w = stepper(code, 1);
    const s = await w.step('1ª tirada', HOST, draw(game, createSeededRng(3)));
    const locked = await w.step('trancar', HOST, toggleLock(s, 2));
    await w.step('destrancar', HOST, toggleLock(locked, 2));
    expect((await readRoom(code)).game.turn.locked).toEqual([false, false, false, false, false]);
  });

  it('o convidado joga a vez dele (tirar, trancar, tirar, marcar)', async () => {
    const { code, game } = await playingRoom({ modeId: 'odd', starter: 1 }); // convidado começa
    expect(game.players[0].id).toBe(GUEST);
    const rng = createSeededRng(11);
    const w = stepper(code, 1);
    let s = await w.step('1ª tirada', GUEST, draw(game, rng));
    s = await w.step('trancar', GUEST, toggleLock(toggleLock(s, 1), 2)); // dois cliques juntados
    s = await w.step('2ª tirada', GUEST, draw(s, rng));
    s = await w.step('marcar Uns (pode zerar)', GUEST, scoreTurn(s, 'ones'));
    await w.step('vez do anfitrião: 1ª tirada', HOST, draw(s, rng));
  });
});

describe('partidas inteiras, em todos os modos', () => {
  for (const mode of MODES) {
    for (const merge of [false, true]) {
      it(`${mode.id}: do começo ao fim ${merge ? '(cadeados juntados pela fila)' : '(cada clique uma gravação)'}`, async () => {
        const seed = merge ? 2 : 1;
        const { code, game } = await playingRoom({ modeId: mode.id, starter: seed % 2 });
        const { state, rev } = await playWholeMatch(code, game, 1, { seed: seed * 31, merge, label: mode.id });
        expect(state.status).toBe('finished');
        const room = await readRoom(code);
        expect(room.status).toBe('finished');
        expect(room.rev).toBe(rev);
      });
    }
  }
});

describe('sala: criar, entrar, ler, sinal de vida', () => {
  it('cria, quem tem o código lê a sala em espera, entra e o anfitrião começa', async () => {
    await assertSucceeds(createRoom(HOST, { code: 'K7MPQR', modeId: 'full' }));
    await assertSucceeds(readAs('K7MPQR', GUEST));
    await assertSucceeds(joinRoom('K7MPQR', GUEST));
    await assertSucceeds(startMatch('K7MPQR', HOST));
    const room = await readRoom('K7MPQR');
    expect(room.status).toBe('playing');
    expect(room.match).toBe(1);
  });

  it('ler um código que não existe (é assim que a tela diz "sala não existe")', async () => {
    const snap = await assertSucceeds(readAs('ZZZZZZ', STRANGER));
    expect(snap.exists()).toBe(false);
  });

  it('membro lê a sala em partida (voltar pelo código)', async () => {
    const { code } = await playingRoom();
    await assertSucceeds(readAs(code, GUEST));
    await assertSucceeds(readAs(code, HOST));
    await assertSucceeds(joinRoom(code, GUEST)); // membro voltando: só lê
  });

  it('sinal de vida dos dois, na vez de qualquer um', async () => {
    const { code } = await playingRoom();
    await assertSucceeds(heartbeat(code, HOST));
    await assertSucceeds(heartbeat(code, GUEST));
  });
});

describe('revanche', () => {
  it('os dois pedem → recomeça; começa quem não começou; a 2ª partida aceita jogadas', async () => {
    const { code, game } = await playingRoom({ modeId: 'basic', starter: 0 });
    const { rev } = await playWholeMatch(code, game, 1, { seed: 5, label: 'basic' });
    await assertSucceeds(voteRematch(code, GUEST));
    let room = await readRoom(code);
    expect(room.status).toBe('finished'); // só um votou
    await assertSucceeds(voteRematch(code, HOST)); // o 2º voto recomeça
    room = await readRoom(code);
    expect(room.status).toBe('playing');
    expect(room.match).toBe(2);
    expect(room.rev).toBe(rev + 1);
    expect(room.game.currentUid).toBe(GUEST); // o anfitrião começou a 1ª

    const second = fromGameDoc(room.game);
    const end = await playWholeMatch(code, second, room.rev, { seed: 9, label: 'revanche' });
    expect(end.state.status).toBe('finished');
  });
});

describe('abandono', () => {
  it('oponente sem sinal há mais de 2 min → encerra; depois dá para pedir revanche', async () => {
    const { code } = await playingRoom();
    await patchRoom(code, { [`presence.${GUEST}`]: Timestamp.fromMillis(Date.now() - 3 * 60 * 1000) });
    await assertSucceeds(forfeit(code, HOST));
    let room = await readRoom(code);
    expect(room.status).toBe('finished');
    expect(room.forfeitUid).toBe(GUEST);

    await assertSucceeds(voteRematch(code, GUEST));
    await assertSucceeds(voteRematch(code, HOST));
    room = await readRoom(code);
    expect(room.status).toBe('playing');
    expect(room.forfeitUid).toBe(null);
  });
});
