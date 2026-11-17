import { describe, expect, it } from 'vitest';
import { MODES, getMode } from '../src/core/modes.js';
import { CATEGORY_IDS } from '../src/core/scoring.js';

describe('MODES', () => {
  it('tem os 8 modos da tabela', () => {
    expect(MODES.map((m) => m.id)).toEqual([
      'basic',
      'odd',
      'even',
      'pairs',
      'low',
      'sequence',
      'no_numbers',
      'full',
    ]);
  });

  it.each([
    ['basic', 1, 3, 6],
    ['odd', 2, 3, 6],
    ['even', 2, 3, 6],
    ['pairs', 3, 3, 8],
    ['low', 3, 3, 6],
    ['sequence', 4, 4, 8],
    ['no_numbers', 4, 4, 9],
    ['full', 5, 4, 15],
  ])('%s: %i estrelas, %i tiradas, %i categorias', (id, stars, draws, count) => {
    const mode = getMode(id);
    expect(mode.stars).toBe(stars);
    expect(mode.maxDraws).toBe(draws);
    expect(mode.categories).toHaveLength(count);
  });

  it('só usa categorias existentes, sem repetir', () => {
    for (const mode of MODES) {
      for (const c of mode.categories) expect(CATEGORY_IDS).toContain(c);
      expect(new Set(mode.categories).size).toBe(mode.categories.length);
    }
  });

  it('categorias específicas de cada modo', () => {
    expect(getMode('odd').categories).toEqual([
      'ones',
      'threes',
      'fives',
      'pair',
      'three_kind',
      'chance',
    ]);
    expect(getMode('even').categories).toEqual([
      'twos',
      'fours',
      'sixes',
      'pair',
      'three_kind',
      'chance',
    ]);
    expect(getMode('low').categories).toEqual([
      'ones',
      'twos',
      'threes',
      'pair',
      'two_pair',
      'chance',
    ]);
    expect(getMode('no_numbers').categories).not.toContain('ones');
    expect([...getMode('full').categories].sort()).toEqual([...CATEGORY_IDS].sort());
  });

  it('getMode falha para modo desconhecido', () => {
    expect(() => getMode('xyz')).toThrow();
  });
});
