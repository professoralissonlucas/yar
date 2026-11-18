import { describe, expect, it } from 'vitest';
import { createGame, draw, scoreTurn, toggleLock } from '../src/core/game.js';
import { createSeededRng } from '../src/core/rng.js';
import { describeRemoteChange } from '../src/ui/remoteChange.js';

const players = [
  { id: 'ana', name: 'Ana' },
  { id: 'bia', name: 'Bia' },
];
const roundTrip = (s) => JSON.parse(JSON.stringify(s));

function setup(seed = 5) {
  const rng = createSeededRng(seed);
  return { rng, start: createGame({ modeId: 'basic', players }) };
}

describe('describeRemoteChange', () => {
  it('nada mudou (inclusive depois de ir e voltar do Firestore)', () => {
    const { start } = setup();
    expect(describeRemoteChange(start, roundTrip(start))).toEqual({ type: 'none' });
  });

  it('1ª tirada: as 5 cartas chegam', () => {
    const { rng, start } = setup();
    expect(describeRemoteChange(start, draw(start, rng))).toEqual({ type: 'update', dealt: [0, 1, 2, 3, 4], locks: [] });
  });

  it('cadeados: só as posições que mudaram', () => {
    const { rng, start } = setup();
    const drawn = draw(start, rng);
    const locked = toggleLock(toggleLock(drawn, 1), 3);
    expect(describeRemoteChange(drawn, locked)).toEqual({ type: 'update', dealt: [], locks: [1, 3] });
  });

  it('nova tirada: chegam as cartas não trancadas (com os cadeados novos juntos)', () => {
    const { rng, start } = setup();
    const drawn = draw(start, rng);
    const redrawn = draw(toggleLock(toggleLock(drawn, 0), 4), rng);
    expect(describeRemoteChange(drawn, redrawn)).toEqual({ type: 'update', dealt: [1, 2, 3], locks: [0, 4] });
  });

  it('marcação do jogador da vez', () => {
    const { rng, start } = setup();
    const drawn = draw(start, rng);
    expect(describeRemoteChange(drawn, scoreTurn(drawn, 'sixes'))).toEqual({ type: 'scored' });
    // tirou e marcou entre dois snapshots
    expect(describeRemoteChange(start, scoreTurn(drawn, 'ones'))).toEqual({ type: 'scored' });
  });

  it('o resto vira reset', () => {
    const { rng, start } = setup();
    const drawn = draw(start, rng);
    const afterAna = scoreTurn(drawn, 'ones');
    const afterBia = scoreTurn(draw(afterAna, rng), 'ones');
    expect(describeRemoteChange(drawn, afterBia)).toEqual({ type: 'reset' }); // pulou um turno inteiro
    expect(describeRemoteChange(drawn, start)).toEqual({ type: 'reset' }); // voltou no tempo
    const other = createGame({ modeId: 'odd', players });
    expect(describeRemoteChange(start, other)).toEqual({ type: 'reset' });
  });
});
