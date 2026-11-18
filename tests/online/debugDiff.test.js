import { describe, expect, it } from 'vitest';
import { draw, toggleLock } from '../../src/core/game.js';
import { createSeededRng } from '../../src/core/rng.js';
import { describeChanges, show } from '../../src/online/debugDiff.js';
import { movePayload, newRoomDoc, startPayload, startingGame, toGameDoc } from '../../src/online/roomState.js';

const SERVER_TIME = { _methodName: 'serverTimestamp' }; // como o FieldValue do SDK
const fakeTimestamp = (ms) => ({ toDate: () => new Date(ms) });

function playingRoom() {
  const room = {
    ...newRoomDoc({ uid: 'host', name: 'Ana', modeId: 'odd', timerEnabled: false, now: fakeTimestamp(0), expireAt: fakeTimestamp(0) }),
    guestUid: 'guest',
    players: { host: { name: 'Ana' }, guest: { name: 'Bia' } },
  };
  const game = startingGame(room, () => 0);
  return { ...room, status: 'playing', rev: 1, match: 1, game: toGameDoc(game) };
}

describe('describeChanges (diagnóstico de gravação recusada)', () => {
  it('2ª tirada: drawsUsed, cartas trocadas, baralho e rev; cartas trancadas não aparecem', () => {
    const room = playingRoom();
    const rng = createSeededRng(3);
    const drawn = draw(toGameDocState(room.game), rng);
    const locked = toggleLock(toggleLock(drawn, 0), 1);
    const before = { ...room, rev: 4, game: toGameDoc(locked) };
    const next = draw(locked, rng);
    const after = movePayload({ uid: 'host', state: next, expectedRev: 4, now: SERVER_TIME, expireAt: fakeTimestamp(86_400_000) });
    const lines = describeChanges(before, after);

    expect(lines).toContain('game.turn.drawsUsed: 1 → 2');
    expect(lines).toContain('rev: 4 → 5');
    expect(lines).toContain('presence.host: 1970-01-01T00:00:00.000Z → serverTimestamp()');
    expect(lines.some((l) => l.startsWith('game.turn.deck: 31 itens → 28 itens'))).toBe(true);
    expect(lines.some((l) => l.startsWith('game.turn.hand[0]'))).toBe(false); // trancada
    expect(lines.some((l) => l.startsWith('game.turn.hand[1]'))).toBe(false); // trancada
    expect(lines.some((l) => l.startsWith('game.turn.locked'))).toBe(false); // cadeados iguais
  });

  it('cadeado: só o cadeado (e rev/horários) muda', () => {
    const room = playingRoom();
    const drawn = draw(toGameDocState(room.game), createSeededRng(1));
    const before = { ...room, rev: 2, game: toGameDoc(drawn) };
    const after = movePayload({ uid: 'host', state: toggleLock(drawn, 3), expectedRev: 2, now: SERVER_TIME, expireAt: fakeTimestamp(5) });
    const gameLines = describeChanges(before, after).filter((l) => l.startsWith('game.'));
    expect(gameLines).toEqual(['game.turn.locked[3]: false → true']);
  });

  it('campo novo (sala sem jogo) e documento novo', () => {
    const waiting = { ...playingRoom(), status: 'waiting', game: null, rev: 0 };
    const game = startingGame(waiting, () => 0);
    const lines = describeChanges(waiting, startPayload(waiting, { uid: 'host', game, now: SERVER_TIME, expireAt: fakeTimestamp(9) }));
    expect(lines).toContain('status: "waiting" → "playing"');
    expect(lines.some((l) => l.startsWith('game: null → {'))).toBe(true);
    expect(describeChanges(null, { rev: 0 })).toEqual(['rev: (ausente) → 0']);
  });

  it('show: listas longas, sentinelas e horários', () => {
    expect(show(Array(31).fill(1))).toBe('[31 itens]');
    expect(show([1, 2])).toBe('[1,2]');
    expect(show(SERVER_TIME)).toBe('serverTimestamp()');
    expect(show(fakeTimestamp(0))).toBe('1970-01-01T00:00:00.000Z');
    expect(show(undefined)).toBe('(ausente)');
  });
});

function toGameDocState(gameDoc) {
  const { currentUid, ...state } = gameDoc;
  return state;
}
