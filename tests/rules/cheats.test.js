/**
 * Trapaças: todas precisam ser NEGADAS pelas regras (emulador). Cada grupo
 * tem um "controle" — a mesma gravação honesta, aceita — para garantir que a
 * recusa vem da trapaça e não de outro detalhe do teste.
 * Rodar com `npm run test:rules`.
 */
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { draw, scoreTurn, toggleLock } from '../../src/core/game.js';
import { createSeededRng } from '../../src/core/rng.js';
import { joinPayload, movePayload, newRoomDoc, rematchPayload } from '../../src/online/roomState.js';
import {
  GUEST,
  HOST,
  NAMES,
  STRANGER,
  Timestamp,
  clearDb,
  commit,
  createRoom,
  dbAs,
  forfeit,
  freshExpireAt,
  joinRoom,
  patchRoom,
  playingRoom,
  rawUpdate,
  readAs,
  readRoom,
  seedRoom,
  serverTimestamp,
  setupEnv,
  startMatch,
  teardownEnv,
} from './helpers.js';

beforeAll(() => setupEnv());
afterAll(teardownEnv);
beforeEach(clearDb);

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Sala no modo Completo, vez do anfitrião, já com a 1ª tirada gravada (rev 2). */
async function drawnRoom(seed = 42) {
  const { code, game } = await playingRoom({ modeId: 'full' });
  const rng = createSeededRng(seed);
  const s = draw(game, rng);
  const rev = await commit(code, HOST, s, 1);
  return { code, s, rev, rng };
}

/** Tirada "na mão" (sem o limite do core): troca as destrancadas pelas do topo do baralho. */
function fakeRedraw(s, bump = 1) {
  const unlocked = s.turn.locked.flatMap((l, i) => (l ? [] : [i]));
  const hand = [...s.turn.hand];
  unlocked.forEach((i, k) => (hand[i] = s.turn.deck[k]));
  return { ...s, turn: { ...s.turn, hand, deck: s.turn.deck.slice(unlocked.length), drawsUsed: s.turn.drawsUsed + bump } };
}

/** Marca `cat` com `points` (e o lastScored igual), partindo da marcação honesta de `base`. */
function setScore(cat, points, player = HOST) {
  return (p) => {
    p.game.scores[player][cat] = points;
    p.game.lastScored = { playerId: player, categoryId: cat, points };
  };
}

const honestMove = (uid, state, expectedRev) =>
  movePayload({ uid, state, expectedRev, now: serverTimestamp(), expireAt: freshExpireAt() });

describe('vez e membros', () => {
  it('controle: o anfitrião marca na vez dele', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertSucceeds(commit(code, HOST, scoreTurn(s, 'chance'), rev));
  });

  it('marcar na vez do outro', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(commit(code, GUEST, scoreTurn(s, 'chance'), rev));
  });

  it('tirar ou trancar na vez do outro', async () => {
    const { code, s, rev, rng } = await drawnRoom();
    await assertFails(commit(code, GUEST, draw(s, rng), rev));
    await assertFails(commit(code, GUEST, toggleLock(s, 0), rev));
  });

  it('quem não é membro grava o game', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(rawUpdate(code, STRANGER, honestMove(STRANGER, scoreTurn(s, 'chance'), rev)));
    await assertFails(rawUpdate(code, STRANGER, honestMove(HOST, scoreTurn(s, 'chance'), rev)));
  });

  it('o convidado começa a partida (só o anfitrião pode)', async () => {
    await createRoom(HOST, { code: 'ABCDEF', modeId: 'odd' });
    await joinRoom('ABCDEF', GUEST);
    await assertFails(startMatch('ABCDEF', GUEST));
  });

  it('jogar com a partida terminada', async () => {
    const { code, s, rev } = await drawnRoom();
    await patchRoom(code, { status: 'finished' });
    await assertFails(commit(code, HOST, scoreTurn(s, 'chance'), rev));
  });
});

describe('placar', () => {
  it('controle: marcação honesta', async () => {
    const { code, s, rev } = await drawnRoom();
    const honest = scoreTurn(s, 'chance');
    await assertSucceeds(commit(code, HOST, honest, rev));
  });

  it('mudar uma pontuação já marcada', async () => {
    // anfitrião marca Chance; convidado joga; anfitrião tira de novo
    const { code, s, rev, rng } = await drawnRoom();
    const afterChance = scoreTurn(s, 'chance');
    let r = await commit(code, HOST, afterChance, rev);
    const g1 = draw(afterChance, rng);
    r = await commit(code, GUEST, g1, r);
    const g2 = scoreTurn(g1, 'ones');
    r = await commit(code, GUEST, g2, r);
    const h = draw(g2, rng);
    r = await commit(code, HOST, h, r);
    const was = afterChance.scores[HOST].chance;
    const other = was === 30 ? 29 : was + 1;
    // num cadeado, aumenta a Chance já marcada
    await assertFails(commit(code, HOST, toggleLock(h, 0), r, (p) => (p.game.scores[HOST].chance = other)));
    // numa marcação de Uns, aumenta também a Chance
    await assertFails(commit(code, HOST, scoreTurn(h, 'ones'), r, (p) => (p.game.scores[HOST].chance = other)));
    // "marca de novo" a Chance (categoria já preenchida)
    await assertFails(
      commit(code, HOST, scoreTurn(h, 'ones'), r, (p) => {
        p.game.scores[HOST].ones = null;
        setScore('chance', other)(p);
      }),
    );
    await assertSucceeds(commit(code, HOST, scoreTurn(h, 'ones'), r)); // controle
  });

  it('mexer no placar do outro', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(commit(code, HOST, scoreTurn(s, 'chance'), rev, (p) => (p.game.scores[GUEST].ones = 5)));
  });

  it('preencher duas categorias de uma vez', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(commit(code, HOST, scoreTurn(s, 'chance'), rev, (p) => (p.game.scores[HOST].yar = 50)));
  });

  it('valor acima do máximo da categoria', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(commit(code, HOST, scoreTurn(s, 'chance'), rev, setScore('chance', 31)));
    await assertFails(commit(code, HOST, scoreTurn(s, 'yar'), rev, setScore('yar', 51)));
    await assertFails(commit(code, HOST, scoreTurn(s, 'ones'), rev, setScore('ones', 6)));
  });

  it('valor abaixo do mínimo (Chance vale no mínimo 5) ou negativo', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(commit(code, HOST, scoreTurn(s, 'chance'), rev, setScore('chance', 2)));
    await assertFails(commit(code, HOST, scoreTurn(s, 'ones'), rev, setScore('ones', -1)));
  });

  it('valor gravado diferente de lastScored.points, ou não inteiro', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(
      commit(code, HOST, scoreTurn(s, 'chance'), rev, (p) => (p.game.scores[HOST].chance = p.game.lastScored.points === 30 ? 29 : 30)),
    );
    await assertFails(commit(code, HOST, scoreTurn(s, 'chance'), rev, setScore('chance', 10.5)));
  });

  it('marcar categoria que não é do modo', async () => {
    const { code, game } = await playingRoom({ modeId: 'basic' });
    const s = draw(game, createSeededRng(1));
    const rev = await commit(code, HOST, s, 1);
    await assertFails(
      commit(code, HOST, scoreTurn(s, 'ones'), rev, (p) => {
        p.game.scores[HOST].ones = null;
        p.game.scores[HOST].yar = 50;
        p.game.lastScored = { playerId: HOST, categoryId: 'yar', points: 50 };
      }),
    );
  });

  it('marcar sem ter tirado as cartas', async () => {
    const { code, game } = await playingRoom({ modeId: 'full' });
    await assertFails(commit(code, HOST, scoreTurn(draw(game, createSeededRng(2)), 'chance'), 1));
  });

  it('marcar e continuar jogando (não passar a vez)', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(
      commit(code, HOST, scoreTurn(s, 'chance'), rev, (p) => {
        p.game.currentPlayerIndex = 0;
        p.game.currentUid = HOST;
      }),
    );
  });

  it('marcar e dizer que a partida acabou', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(
      commit(code, HOST, scoreTurn(s, 'chance'), rev, (p) => {
        p.game.status = 'finished';
        p.status = 'finished';
      }),
    );
  });

  it('marcar em nome do outro jogador', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(
      commit(code, HOST, scoreTurn(s, 'chance'), rev, (p) => {
        p.game.scores[GUEST].chance = p.game.scores[HOST].chance;
        p.game.scores[HOST].chance = null;
        p.game.lastScored.playerId = GUEST;
      }),
    );
  });
});

describe('tiradas e cadeados', () => {
  it('controle: tirada honesta e cadeado honesto', async () => {
    const { code, s, rev } = await drawnRoom();
    const locked = toggleLock(s, 1);
    const r = await assertSucceeds(commit(code, HOST, locked, rev));
    await assertSucceeds(commit(code, HOST, fakeRedraw(locked), r));
  });

  it('tirar além do limite do modo', async () => {
    const { code, s, rev, rng } = await drawnRoom(); // Completo: 4 tiradas
    let st = s;
    let r = rev;
    for (let i = 2; i <= 4; i++) {
      st = draw(st, rng);
      r = await commit(code, HOST, st, r);
    }
    await assertFails(commit(code, HOST, fakeRedraw(st), r)); // 5ª
  });

  it('pular uma tirada (drawsUsed +2)', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(commit(code, HOST, fakeRedraw(s, 2), rev));
  });

  it('trocar uma carta trancada', async () => {
    const { code, s, rev, rng } = await drawnRoom();
    const locked = toggleLock(s, 0);
    const r = await commit(code, HOST, locked, rev);
    const next = draw(locked, rng);
    await assertFails(commit(code, HOST, next, r, (p) => (p.game.turn.hand[0] = p.game.turn.hand[0] === 6 ? 5 : 6)));
  });

  it('mudar a mão sem tirar (num cadeado)', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(commit(code, HOST, toggleLock(s, 0), rev, (p) => (p.game.turn.hand = [6, 6, 6, 6, 6])));
  });

  it('mexer no baralho num cadeado', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(commit(code, HOST, toggleLock(s, 0), rev, (p) => p.game.turn.deck.pop()));
  });

  it('baralho que não encolhe certo na tirada', async () => {
    const { code, s, rev, rng } = await drawnRoom();
    const next = draw(s, rng);
    await assertFails(commit(code, HOST, next, rev, (p) => p.game.turn.deck.pop())); // tirou demais
    await assertFails(commit(code, HOST, next, rev, (p) => p.game.turn.deck.push(6))); // não tirou
  });

  it('mudar os cadeados junto com a tirada', async () => {
    const { code, s, rev, rng } = await drawnRoom();
    await assertFails(commit(code, HOST, draw(s, rng), rev, (p) => (p.game.turn.locked[0] = true)));
  });

  it('tirar com todas as cartas trancadas', async () => {
    const { code, s, rev } = await drawnRoom();
    let all = s;
    for (let i = 0; i < 5; i++) all = toggleLock(all, i);
    const r = await commit(code, HOST, all, rev);
    await assertFails(commit(code, HOST, fakeRedraw(all), r));
  });

  it('mão ou cadeados com forma errada', async () => {
    const { code, s, rev, rng } = await drawnRoom();
    const next = draw(s, rng);
    await assertFails(commit(code, HOST, next, rev, (p) => (p.game.turn.hand[1] = 7)));
    await assertFails(commit(code, HOST, next, rev, (p) => p.game.turn.hand.push(6)));
    await assertFails(commit(code, HOST, toggleLock(s, 2), rev, (p) => (p.game.turn.locked[2] = 'sim')));
    await assertFails(commit(code, HOST, toggleLock(s, 2), rev, (p) => p.game.turn.locked.push(false)));
  });

  it('1ª tirada com mão escolhida e baralho incompleto, ou já trancada', async () => {
    const { code, game } = await playingRoom({ modeId: 'full' });
    const first = draw(game, createSeededRng(5));
    await assertFails(commit(code, HOST, first, 1, (p) => p.game.turn.deck.splice(0, 3)));
    await assertFails(commit(code, HOST, first, 1, (p) => (p.game.turn.locked = [true, false, false, false, false])));
    await assertSucceeds(commit(code, HOST, first, 1)); // controle
  });
});

describe('campos fixos, campos extras, rev e horários', () => {
  const fixed = {
    hostUid: () => STRANGER,
    guestUid: () => STRANGER,
    mode: () => 'basic',
    [`players.${HOST}`]: () => ({ name: 'Outro' }),
    timerEnabled: () => true,
    createdAt: () => serverTimestamp(),
  };
  for (const [field, value] of Object.entries(fixed)) {
    it(`mudar ${field.split('.')[0]} junto com uma jogada`, async () => {
      const { code, s, rev } = await drawnRoom();
      await assertFails(commit(code, HOST, toggleLock(s, 0), rev, (p) => (p[field] = value())));
    });
  }

  it('mudar campos fixos do game (tiradas, categorias, jogadores, modo)', async () => {
    const { code, s, rev } = await drawnRoom();
    const lock = toggleLock(s, 0);
    await assertFails(commit(code, HOST, lock, rev, (p) => (p.game.maxDraws = 9)));
    await assertFails(commit(code, HOST, lock, rev, (p) => (p.game.categories = ['yar'])));
    await assertFails(commit(code, HOST, lock, rev, (p) => (p.game.players[1].name = 'Outro')));
    await assertFails(commit(code, HOST, lock, rev, (p) => (p.game.modeId = 'basic')));
    await assertFails(commit(code, HOST, lock, rev, (p) => (p.game.currentUid = GUEST)));
  });

  it('campo extra na sala, no game ou no turno', async () => {
    const { code, s, rev, rng } = await drawnRoom();
    await assertFails(commit(code, HOST, toggleLock(s, 0), rev, (p) => (p.hacked = true)));
    await assertFails(commit(code, HOST, toggleLock(s, 0), rev, (p) => (p.game.extra = 1)));
    await assertFails(commit(code, HOST, draw(s, rng), rev, (p) => (p.game.turn.bonus = 1)));
  });

  it('rev que não sobe exatamente 1', async () => {
    const { code, s, rev } = await drawnRoom();
    await assertFails(commit(code, HOST, toggleLock(s, 0), rev, (p) => (p.rev = rev)));
    await assertFails(commit(code, HOST, toggleLock(s, 0), rev, (p) => (p.rev = rev + 2)));
  });

  it('mudar o game sem subir o rev', async () => {
    const { code, s, rev } = await drawnRoom();
    const p = honestMove(HOST, toggleLock(s, 0), rev);
    delete p.rev;
    await assertFails(rawUpdate(code, HOST, p));
  });

  it('expireAt fora de "agora + 24 h" ou updatedAt falso', async () => {
    const { code, s, rev } = await drawnRoom();
    const lock = toggleLock(s, 0);
    await assertFails(commit(code, HOST, lock, rev, (p) => (p.expireAt = Timestamp.fromMillis(Date.now() + 48 * HOUR))));
    await assertFails(commit(code, HOST, lock, rev, (p) => (p.expireAt = Timestamp.fromMillis(Date.now() - HOUR))));
    await assertFails(commit(code, HOST, lock, rev, (p) => (p.updatedAt = Timestamp.fromMillis(Date.now() - HOUR))));
  });
});

describe('presença, revanche e abandono', () => {
  /** Partida encerrada por abandono do convidado (legítimo). */
  async function finishedRoom() {
    const { code } = await playingRoom();
    await patchRoom(code, { [`presence.${GUEST}`]: Timestamp.fromMillis(Date.now() - 3 * MIN) });
    await forfeit(code, HOST);
    return code;
  }

  it('gravar a presença do outro, ou com horário falso', async () => {
    const { code } = await playingRoom();
    await assertFails(rawUpdate(code, HOST, { [`presence.${GUEST}`]: serverTimestamp() }));
    await assertFails(rawUpdate(code, HOST, { [`presence.${HOST}`]: Timestamp.fromMillis(Date.now() + HOUR) }));
    await assertSucceeds(rawUpdate(code, HOST, { [`presence.${HOST}`]: serverTimestamp() })); // controle
  });

  it('encerrar por abandono antes de 2 minutos', async () => {
    const { code } = await playingRoom();
    await assertFails(forfeit(code, HOST));
    await patchRoom(code, { [`presence.${GUEST}`]: Timestamp.fromMillis(Date.now() - 90 * 1000) });
    await assertFails(forfeit(code, HOST));
  });

  it('abandono apontando a si mesmo, ou mexendo no game junto', async () => {
    const { code } = await playingRoom();
    await patchRoom(code, { [`presence.${GUEST}`]: Timestamp.fromMillis(Date.now() - 3 * MIN) });
    const base = { status: 'finished', [`presence.${HOST}`]: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertFails(rawUpdate(code, HOST, { ...base, forfeitUid: HOST }));
    await assertFails(rawUpdate(code, HOST, { ...base, forfeitUid: GUEST, 'game.round': 3 }));
  });

  it('votar no lugar do outro, ou para outra partida', async () => {
    const code = await finishedRoom();
    const room = await readRoom(code);
    const base = { [`presence.${HOST}`]: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertFails(rawUpdate(code, HOST, { ...base, [`rematch.${GUEST}`]: room.match }));
    await assertFails(rawUpdate(code, HOST, { ...base, [`rematch.${HOST}`]: room.match + 5 }));
    await assertSucceeds(rawUpdate(code, HOST, { ...base, [`rematch.${HOST}`]: room.match })); // controle
  });

  it('recomeçar sem o voto do outro', async () => {
    const code = await finishedRoom();
    const room = await readRoom(code);
    const fakeVote = { ...room, rematch: { [GUEST]: room.match } }; // finge que o convidado votou
    await assertFails(
      rawUpdate(code, HOST, rematchPayload(fakeVote, { uid: HOST, now: serverTimestamp(), expireAt: freshExpireAt() })),
    );
  });

  it('recomeçar com um jogo já adiantado', async () => {
    const code = await finishedRoom();
    await rawUpdate(code, GUEST, { [`rematch.${GUEST}`]: (await readRoom(code)).match, updatedAt: serverTimestamp() });
    const room = await readRoom(code);
    const payload = rematchPayload(room, { uid: HOST, now: serverTimestamp(), expireAt: freshExpireAt() });
    payload.game = structuredClone(payload.game);
    payload.game.scores[HOST].yar = 50;
    await assertFails(rawUpdate(code, HOST, payload));
  });
});

describe('sala: entrar, ler, criar, apagar, listar', () => {
  const join = (code, uid) =>
    rawUpdate(code, uid, joinPayload({ uid, name: NAMES[uid], now: serverTimestamp(), expireAt: freshExpireAt() }));

  it('entrar em sala cheia ou em partida', async () => {
    await createRoom(HOST, { code: 'ABCDEF' });
    await joinRoom('ABCDEF', GUEST);
    await assertFails(join('ABCDEF', STRANGER)); // cheia
    await startMatch('ABCDEF', HOST);
    await assertFails(join('ABCDEF', STRANGER)); // em partida
  });

  it('entrar em sala vencida', async () => {
    await createRoom(HOST, { code: 'ABCDEF' });
    await patchRoom('ABCDEF', { expireAt: Timestamp.fromMillis(Date.now() - MIN) });
    await assertFails(join('ABCDEF', GUEST));
  });

  it('entrar com apelido longo demais, ou ocupando a vaga com outro uid', async () => {
    await createRoom(HOST, { code: 'ABCDEF' });
    const long = joinPayload({ uid: GUEST, name: 'x'.repeat(17), now: serverTimestamp(), expireAt: freshExpireAt() });
    await assertFails(rawUpdate('ABCDEF', GUEST, long));
    const other = joinPayload({ uid: STRANGER, name: 'Caio', now: serverTimestamp(), expireAt: freshExpireAt() });
    await assertFails(rawUpdate('ABCDEF', GUEST, other));
    await assertSucceeds(join('ABCDEF', GUEST)); // controle
  });

  it('ler sala em partida sem ser membro, ou sem login', async () => {
    const { code } = await playingRoom();
    await assertFails(readAs(code, STRANGER));
    await assertFails(readAs(code, null));
  });

  it('criar sem login, em nome de outro, com código inválido ou já com jogo', async () => {
    const roomDoc = (uid, extra = {}) => ({
      ...newRoomDoc({ uid, name: NAMES[uid] ?? 'X', modeId: 'odd', timerEnabled: false, now: serverTimestamp(), expireAt: freshExpireAt() }),
      ...extra,
    });
    await assertFails(setDoc(doc(dbAs(null), 'rooms', 'ABCDEF'), roomDoc(HOST)));
    await assertFails(setDoc(doc(dbAs(STRANGER), 'rooms', 'ABCDEF'), roomDoc(HOST)));
    await assertFails(setDoc(doc(dbAs(HOST), 'rooms', 'ABC0EF'), roomDoc(HOST)));
    await assertFails(setDoc(doc(dbAs(HOST), 'rooms', 'ABCDEF'), roomDoc(HOST, { rev: 5 })));
    await assertFails(setDoc(doc(dbAs(HOST), 'rooms', 'ABCDEF'), roomDoc(HOST, { mode: 'inventado' })));
    await assertFails(setDoc(doc(dbAs(HOST), 'rooms', 'ABCDEF'), roomDoc(HOST, { status: 'playing' })));
    await assertSucceeds(setDoc(doc(dbAs(HOST), 'rooms', 'ABCDEF'), roomDoc(HOST))); // controle
  });

  it('apagar sala (nem o anfitrião)', async () => {
    const { code } = await playingRoom();
    await assertFails(deleteDoc(doc(dbAs(HOST), 'rooms', code)));
    await assertFails(deleteDoc(doc(dbAs(STRANGER), 'rooms', code)));
  });

  it('listar as salas', async () => {
    await createRoom(HOST, { code: 'ABCDEF' });
    await seedRoom('BCDEFG', { status: 'waiting' });
    await assertFails(getDocs(collection(dbAs(HOST), 'rooms')));
    await assertFails(getDocs(collection(dbAs(STRANGER), 'rooms')));
  });
});
