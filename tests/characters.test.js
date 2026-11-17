import { describe, expect, it } from 'vitest';
import {
  ALISHOW,
  POSES,
  getCharacter,
  pickLine,
  reactToOpponentScore,
  reactToOwnDraw,
  reactToOwnScore,
  resultPose,
} from '../src/ui/characters.js';
import { createSeededRng } from '../src/core/rng.js';

describe('Prof. Alishow', () => {
  it('tem as 8 poses com imagem (via import.meta.glob)', () => {
    for (const pose of POSES) {
      expect(typeof ALISHOW.images[pose]).toBe('string');
      expect(ALISHOW.images[pose]).toMatch(new RegExp(`${pose}\\.png`));
    }
    expect(getCharacter('alishow')).toBe(ALISHOW);
    expect(() => getCharacter('xyz')).toThrow();
  });

  it('todas as poses de reação têm frases', () => {
    for (const pose of POSES.filter((p) => p !== 'neutral')) {
      expect(ALISHOW.lines[pose].length).toBeGreaterThan(0);
    }
    expect(ALISHOW.lines.neutral).toEqual([]);
  });
});

describe('reactToOwnScore', () => {
  it('zerar deixa irritado', () => {
    expect(reactToOwnScore({ categoryId: 'ones', points: 0 })).toBe('annoyed');
    expect(reactToOwnScore({ categoryId: 'yar', points: 0 })).toBe('annoyed');
  });

  it('Yar!, Corda e Sedução do Lobo empolgam', () => {
    expect(reactToOwnScore({ categoryId: 'yar', points: 50 })).toBe('excited');
    expect(reactToOwnScore({ categoryId: 'large_straight', points: 40 })).toBe('excited');
    expect(reactToOwnScore({ categoryId: 'full_house', points: 25 })).toBe('excited');
  });

  it('Rude e Estrada Bifurcada deixam feliz', () => {
    expect(reactToOwnScore({ categoryId: 'two_pair', points: 15 })).toBe('happy');
    expect(reactToOwnScore({ categoryId: 'small_straight', points: 30 })).toBe('happy');
  });

  it('categorias variáveis: feliz com 60% ou mais do máximo', () => {
    expect(reactToOwnScore({ categoryId: 'fives', points: 20 })).toBe('happy'); // 4 cincos
    expect(reactToOwnScore({ categoryId: 'fives', points: 15 })).toBe('happy'); // exatamente 60%
    expect(reactToOwnScore({ categoryId: 'fives', points: 10 })).toBeNull();
    expect(reactToOwnScore({ categoryId: 'chance', points: 18 })).toBe('happy');
    expect(reactToOwnScore({ categoryId: 'chance', points: 17 })).toBeNull();
    expect(reactToOwnScore({ categoryId: 'four_kind', points: 16 })).toBe('happy'); // 16/24
    expect(reactToOwnScore({ categoryId: 'pair', points: 6 })).toBeNull();
  });
});

describe('reactToOwnDraw', () => {
  it('cinco iguais ou sequência de 5 empolgam', () => {
    expect(reactToOwnDraw([3, 3, 3, 3, 3])).toBe('excited');
    expect(reactToOwnDraw([5, 3, 1, 4, 2])).toBe('excited');
    expect(reactToOwnDraw([6, 4, 2, 5, 3])).toBe('excited');
  });

  it('outras mãos não', () => {
    expect(reactToOwnDraw([1, 2, 3, 4, 6])).toBeNull();
    expect(reactToOwnDraw([6, 6, 6, 6, 1])).toBeNull();
    expect(reactToOwnDraw([])).toBeNull();
  });
});

describe('reactToOpponentScore', () => {
  it('25 pontos ou mais, ou Yar!, surpreendem', () => {
    expect(reactToOpponentScore({ categoryId: 'full_house', points: 25 })).toBe('surprised');
    expect(reactToOpponentScore({ categoryId: 'chance', points: 26 })).toBe('surprised');
    expect(reactToOpponentScore({ categoryId: 'yar', points: 50 })).toBe('surprised');
  });

  it('jogadas menores não', () => {
    expect(reactToOpponentScore({ categoryId: 'chance', points: 24 })).toBeNull();
    expect(reactToOpponentScore({ categoryId: 'yar', points: 0 })).toBeNull();
  });
});

describe('resultPose', () => {
  it('vitória, derrota e empate', () => {
    expect(resultPose({ won: true, tie: false })).toBe('victory');
    expect(resultPose({ won: false, tie: false })).toBe('defeat');
    expect(resultPose({ won: true, tie: true })).toBe('happy');
  });
});

describe('pickLine', () => {
  it('nunca repete a frase anterior quando há alternativa', () => {
    const rng = createSeededRng(3);
    let previous = null;
    for (let i = 0; i < 200; i++) {
      const line = pickLine(ALISHOW, 'happy', previous, rng);
      expect(ALISHOW.lines.happy).toContain(line);
      expect(line).not.toBe(previous);
      previous = line;
    }
  });

  it('pose sem frases devolve null; pose com uma frase pode repetir', () => {
    expect(pickLine(ALISHOW, 'neutral', null, Math.random)).toBeNull();
    const single = { lines: { victory: ['Só uma'] } };
    expect(pickLine(single, 'victory', 'Só uma', Math.random)).toBe('Só uma');
  });
});
