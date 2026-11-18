import { describe, expect, it } from 'vitest';
import { draw, scoreTurn } from '../../src/core/game.js';
import { createSeededRng } from '../../src/core/rng.js';
import {
  AWAY_AFTER_MS,
  FORFEIT_AFTER_MS,
  ROOM_MAX_AGE_MS,
  createServerClock,
  fromGameDoc,
  joinError,
  newRoomDoc,
  otherUid,
  presenceStatus,
  rematchGame,
  rematchInfo,
  roomResult,
  startingGame,
  toGameDoc,
  toMillis,
} from '../../src/online/roomState.js';

const NOW = 1_800_000_000_000;

function waitingRoom(overrides = {}) {
  return { ...newRoomDoc({ uid: 'host', name: 'Ana', modeId: 'basic', timerEnabled: false, now: NOW }), ...overrides };
}

function fullRoom(overrides = {}) {
  return waitingRoom({
    guestUid: 'guest',
    players: { host: { name: 'Ana' }, guest: { name: 'Bia' } },
    ...overrides,
  });
}

/** Firestore guarda JSON: o estado tem que sobreviver à ida e volta. */
const roundTrip = (value) => JSON.parse(JSON.stringify(value));

/** Joga a partida inteira marcando sempre a 1ª categoria vazia. */
function playToEnd(state, rng) {
  let s = state;
  while (s.status === 'playing') {
    s = draw(s, rng);
    const player = s.players[s.currentPlayerIndex].id;
    const empty = s.categories.find((c) => s.scores[player][c] === null);
    s = scoreTurn(s, empty);
  }
  return s;
}

describe('newRoomDoc', () => {
  it('cria a sala em espera, só com o anfitrião', () => {
    const room = waitingRoom();
    expect(room).toMatchObject({
      hostUid: 'host',
      guestUid: null,
      players: { host: { name: 'Ana' } },
      mode: 'basic',
      status: 'waiting',
      rev: 0,
      match: 0,
      game: null,
      presence: { host: NOW },
      rematch: {},
      forfeitUid: null,
    });
  });

  it('recusa modo desconhecido', () => {
    expect(() => newRoomDoc({ uid: 'x', name: 'X', modeId: 'nope', now: NOW })).toThrow();
  });
});

describe('joinError', () => {
  it('sala inexistente', () => {
    expect(joinError(null, 'guest', NOW)).toBe('not_found');
  });

  it('sala em espera com vaga: pode entrar', () => {
    expect(joinError(waitingRoom(), 'guest', NOW)).toBeNull();
  });

  it('sala cheia, já começou ou terminou', () => {
    expect(joinError(fullRoom(), 'outro', NOW)).toBe('full');
    expect(joinError(fullRoom({ status: 'playing' }), 'outro', NOW)).toBe('started');
    expect(joinError(fullRoom({ status: 'finished' }), 'outro', NOW)).toBe('finished');
  });

  it('membro sempre pode voltar para a sala', () => {
    expect(joinError(fullRoom({ status: 'playing' }), 'guest', NOW)).toBeNull();
    expect(joinError(fullRoom({ status: 'finished' }), 'host', NOW)).toBeNull();
  });

  it('sala parada há mais de 24 h expirou', () => {
    const old = waitingRoom({ updatedAt: NOW - ROOM_MAX_AGE_MS - 1 });
    expect(joinError(old, 'guest', NOW)).toBe('expired');
    expect(joinError(waitingRoom({ updatedAt: { toMillis: () => NOW - 1000 } }), 'guest', NOW)).toBeNull();
  });
});

describe('presença', () => {
  it('online, desconectado (> 60 s) e sumido (> 2 min)', () => {
    expect(presenceStatus(NOW - 1000, NOW)).toBe('online');
    expect(presenceStatus(NOW - AWAY_AFTER_MS, NOW)).toBe('online');
    expect(presenceStatus(NOW - AWAY_AFTER_MS - 1, NOW)).toBe('away');
    expect(presenceStatus(NOW - FORFEIT_AFTER_MS - 1, NOW)).toBe('gone');
    expect(presenceStatus(null, NOW)).toBe('online');
  });

  it('toMillis aceita Timestamp, Date, número e null', () => {
    expect(toMillis({ toMillis: () => 42 })).toBe(42);
    expect(toMillis(new Date(7))).toBe(7);
    expect(toMillis(5)).toBe(5);
    expect(toMillis(null)).toBeNull();
  });

  it('relógio do servidor estimado pelo meu próprio lastSeen', () => {
    let local = 1000;
    const clock = createServerClock(() => local);
    expect(clock.now()).toBe(1000);
    clock.observe(50_000); // servidor está 49 s à frente
    local = 3000;
    expect(clock.now()).toBe(52_000);
    // o mesmo lastSeen de novo (snapshot de outra mudança) não mexe no offset
    local = 10_000;
    clock.observe(50_000);
    expect(clock.now()).toBe(59_000);
  });
});

describe('estado da partida no Firestore', () => {
  it('startingGame sorteia quem começa com os dois membros', () => {
    const first = startingGame(fullRoom(), () => 0);
    const second = startingGame(fullRoom(), () => 0.99);
    expect(first.players.map((p) => p.id)).toEqual(['host', 'guest']);
    expect(second.players.map((p) => p.id)).toEqual(['guest', 'host']);
    expect(first.players[1].name).toBe('Bia');
    expect(first.modeId).toBe('basic');
    expect(() => startingGame(waitingRoom(), Math.random)).toThrow();
  });

  it('toGameDoc/fromGameDoc: mesmo formato do core + currentUid, sobrevive ao JSON', () => {
    const rng = createSeededRng(3);
    const state = draw(startingGame(fullRoom(), rng), rng);
    const doc = roundTrip(toGameDoc(state));
    expect(doc.currentUid).toBe(state.players[0].id);
    expect(fromGameDoc(doc)).toEqual(state);
  });

  it('o estado do core não tem arrays aninhados nem undefined (o Firestore não aceita)', () => {
    const rng = createSeededRng(9);
    const state = scoreTurn(draw(startingGame(fullRoom(), rng), rng), 'ones');
    const check = (value, insideArray) => {
      expect(value).not.toBeUndefined();
      if (Array.isArray(value)) {
        expect(insideArray).toBe(false);
        value.forEach((v) => check(v, true));
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach((v) => check(v, false));
      }
    };
    check(toGameDoc(state), false);
  });

  it('fromGameDoc recusa estado estranho', () => {
    const state = startingGame(fullRoom(), () => 0);
    expect(() => fromGameDoc(null)).toThrow();
    expect(() => fromGameDoc({ ...toGameDoc(state), currentUid: 'guest' })).toThrow();
    expect(() => fromGameDoc({ ...toGameDoc(state), turn: { ...state.turn, locked: [] } })).toThrow();
    expect(() => fromGameDoc({ ...toGameDoc(state), players: [state.players[0]] })).toThrow();
  });
});

describe('revanche e resultado', () => {
  it('revanche: começa quem não começou a anterior', () => {
    const game = toGameDoc(startingGame(fullRoom(), () => 0)); // host começou
    expect(rematchGame(fullRoom({ game })).players[0].id).toBe('guest');
    const game2 = toGameDoc(startingGame(fullRoom(), () => 0.99)); // guest começou
    expect(rematchGame(fullRoom({ game: game2 })).players[0].id).toBe('host');
  });

  it('votos valem só para a partida atual', () => {
    const room = fullRoom({ status: 'finished', match: 2, rematch: { host: 2, guest: 1 } });
    expect(rematchInfo(room, 'host')).toEqual({ mine: true, theirs: false });
    expect(rematchInfo(room, 'guest')).toEqual({ mine: false, theirs: true });
    expect(otherUid(room, 'guest')).toBe('host');
  });

  it('resultado normal usa o core; abandono dá a vitória para quem ficou', () => {
    const rng = createSeededRng(11);
    const finished = playToEnd(startingGame(fullRoom(), rng), rng);
    const normal = roomResult(fullRoom({ status: 'finished', game: toGameDoc(finished) }));
    expect(normal.forfeitUid).toBeNull();
    expect(Object.keys(normal.totals).sort()).toEqual(['guest', 'host']);

    const midGame = draw(startingGame(fullRoom(), rng), rng);
    const forfeited = roomResult(fullRoom({ status: 'finished', forfeitUid: 'guest', game: toGameDoc(midGame) }));
    expect(forfeited).toMatchObject({ winnerIds: ['host'], isTie: false, forfeitUid: 'guest' });
  });
});
