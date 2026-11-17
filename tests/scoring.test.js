import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_IDS, scoreCategory, scoreHand } from '../src/core/scoring.js';

describe('CATEGORIES', () => {
  it('tem as 15 categorias na ordem de menor potencial', () => {
    expect(CATEGORY_IDS).toEqual([
      'ones',
      'twos',
      'threes',
      'fours',
      'fives',
      'sixes',
      'pair',
      'three_kind',
      'four_kind',
      'two_pair',
      'full_house',
      'yar',
      'small_straight',
      'large_straight',
      'chance',
    ]);
  });

  it('usa os nomes PT-BR e Garra de Dragão vai até 24', () => {
    const byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
    expect(byId.ones.name).toBe('Fragmento Um');
    expect(byId.full_house.name).toBe('Sedução do Lobo');
    expect(byId.chance.name).toBe('Kkakdugi');
    expect(byId.four_kind.max).toBe(24);
  });
});

describe('scoreHand', () => {
  it('devolve as 15 categorias', () => {
    expect(Object.keys(scoreHand([1, 2, 3, 4, 5])).sort()).toEqual([...CATEGORY_IDS].sort());
  });

  it('rejeita mãos inválidas', () => {
    expect(() => scoreHand([1, 2, 3, 4])).toThrow();
    expect(() => scoreHand([1, 2, 3, 4, 5, 6])).toThrow();
    expect(() => scoreHand([0, 2, 3, 4, 5])).toThrow();
    expect(() => scoreHand([7, 2, 3, 4, 5])).toThrow();
    expect(() => scoreHand([1.5, 2, 3, 4, 5])).toThrow();
  });

  it('não altera o array recebido', () => {
    const hand = [5, 3, 1, 4, 2];
    scoreHand(hand);
    expect(hand).toEqual([5, 3, 1, 4, 2]);
  });

  it('valida uma única categoria com scoreCategory', () => {
    expect(scoreCategory([6, 6, 6, 2, 2], 'sixes')).toBe(18);
    expect(() => scoreCategory([6, 6, 6, 2, 2], 'nope')).toThrow();
  });
});

describe('seção de números (Fragmento Um … Seis Buquês)', () => {
  it.each([
    ['ones', [1, 1, 3, 1, 5], 3],
    ['twos', [2, 2, 3, 4, 5], 4],
    ['threes', [3, 3, 3, 3, 1], 12],
    ['fours', [4, 1, 2, 3, 5], 4],
    ['fives', [5, 5, 5, 5, 5], 25],
    ['sixes', [6, 6, 1, 6, 6], 24],
  ])('%s soma só as cartas daquele valor', (id, hand, expected) => {
    expect(scoreHand(hand)[id]).toBe(expected);
  });

  it.each([
    ['ones', 5],
    ['twos', 10],
    ['threes', 15],
    ['fours', 20],
    ['fives', 25],
    ['sixes', 30],
  ])('%s chega no máximo %i com cinco iguais', (id, max) => {
    const value = CATEGORY_IDS.indexOf(id) + 1;
    expect(scoreHand(Array(5).fill(value))[id]).toBe(max);
  });

  it('dá 0 quando o valor não aparece', () => {
    const s = scoreHand([2, 3, 4, 5, 6]);
    expect(s.ones).toBe(0);
    expect(scoreHand([1, 2, 3, 4, 5]).sixes).toBe(0);
  });
});

describe('Parceiro (pair)', () => {
  it('soma só o par de maior valor', () => {
    expect(scoreHand([6, 6, 2, 2, 3]).pair).toBe(12);
    expect(scoreHand([2, 6, 3, 2, 6]).pair).toBe(12);
  });

  it('com trinca + par, usa o maior valor (só 2 cartas)', () => {
    expect(scoreHand([2, 2, 5, 5, 5]).pair).toBe(10);
    expect(scoreHand([6, 6, 1, 1, 1]).pair).toBe(12);
  });

  it('com quadra ou cinco iguais soma só 2 cartas', () => {
    expect(scoreHand([4, 4, 4, 4, 1]).pair).toBe(8);
    expect(scoreHand([6, 6, 6, 6, 6]).pair).toBe(12);
  });

  it('dá 0 sem par', () => {
    expect(scoreHand([1, 2, 3, 4, 6]).pair).toBe(0);
  });
});

describe('Pico (three_kind)', () => {
  it('soma só as 3 cartas iguais', () => {
    expect(scoreHand([3, 3, 3, 6, 5]).three_kind).toBe(9);
    expect(scoreHand([6, 2, 6, 1, 6]).three_kind).toBe(18);
  });

  it('com quadra, cinco iguais ou full house soma só 3', () => {
    expect(scoreHand([5, 5, 5, 5, 2]).three_kind).toBe(15);
    expect(scoreHand([1, 1, 1, 1, 1]).three_kind).toBe(3);
    expect(scoreHand([2, 2, 2, 6, 6]).three_kind).toBe(6);
  });

  it('dá 0 sem trinca', () => {
    expect(scoreHand([6, 6, 5, 5, 4]).three_kind).toBe(0);
  });
});

describe('Garra de Dragão (four_kind)', () => {
  it('soma só as 4 cartas iguais, máximo 24', () => {
    expect(scoreHand([2, 2, 2, 2, 6]).four_kind).toBe(8);
    expect(scoreHand([6, 6, 1, 6, 6]).four_kind).toBe(24);
    expect(scoreHand([6, 6, 6, 6, 6]).four_kind).toBe(24);
  });

  it('dá 0 com só trinca', () => {
    expect(scoreHand([6, 6, 6, 5, 5]).four_kind).toBe(0);
  });
});

describe('Rude (two_pair)', () => {
  it('vale 15 com dois pares de valores diferentes', () => {
    expect(scoreHand([1, 1, 2, 2, 6]).two_pair).toBe(15);
    expect(scoreHand([4, 6, 4, 3, 6]).two_pair).toBe(15);
  });

  it('full house também conta como Rude', () => {
    expect(scoreHand([3, 3, 3, 5, 5]).two_pair).toBe(15);
  });

  it('quadra sozinha NÃO conta', () => {
    expect(scoreHand([4, 4, 4, 4, 2]).two_pair).toBe(0);
  });

  it('cinco iguais NÃO contam', () => {
    expect(scoreHand([5, 5, 5, 5, 5]).two_pair).toBe(0);
  });

  it('um par só ou trinca só dá 0', () => {
    expect(scoreHand([1, 1, 2, 3, 4]).two_pair).toBe(0);
    expect(scoreHand([1, 1, 1, 3, 4]).two_pair).toBe(0);
  });
});

describe('Sedução do Lobo (full_house)', () => {
  it('vale 25 com trinca + par de outro valor, em qualquer ordem', () => {
    expect(scoreHand([3, 3, 3, 5, 5]).full_house).toBe(25);
    expect(scoreHand([5, 3, 5, 3, 3]).full_house).toBe(25);
  });

  it('cinco iguais NÃO contam', () => {
    expect(scoreHand([2, 2, 2, 2, 2]).full_house).toBe(0);
    expect(scoreHand([6, 6, 6, 6, 6]).full_house).toBe(0);
  });

  it('quadra + 1, dois pares ou trinca solta dão 0', () => {
    expect(scoreHand([4, 4, 4, 4, 2]).full_house).toBe(0);
    expect(scoreHand([1, 1, 2, 2, 3]).full_house).toBe(0);
    expect(scoreHand([1, 1, 1, 2, 3]).full_house).toBe(0);
  });
});

describe('Yar!', () => {
  it('vale 50 com cinco iguais', () => {
    expect(scoreHand([1, 1, 1, 1, 1]).yar).toBe(50);
    expect(scoreHand([6, 6, 6, 6, 6]).yar).toBe(50);
  });

  it('dá 0 com quadra', () => {
    expect(scoreHand([6, 6, 6, 6, 5]).yar).toBe(0);
  });

  it('cinco iguais: Yar 50, Garra/Pico/Parceiro só 4/3/2 cartas, sem Rude/Sedução', () => {
    expect(scoreHand([3, 3, 3, 3, 3])).toMatchObject({
      yar: 50,
      four_kind: 12,
      three_kind: 9,
      pair: 6,
      two_pair: 0,
      full_house: 0,
      threes: 15,
      chance: 15,
      small_straight: 0,
      large_straight: 0,
    });
  });
});

describe('Estrada Bifurcada (small_straight)', () => {
  it.each([
    [[1, 2, 3, 4, 6]],
    [[2, 3, 4, 5, 2]],
    [[3, 4, 5, 6, 1]],
  ])('vale 30 com 4 em sequência: %j', (hand) => {
    expect(scoreHand(hand).small_straight).toBe(30);
  });

  it('a ordem não importa e repetições são permitidas', () => {
    expect(scoreHand([4, 1, 3, 2, 2]).small_straight).toBe(30);
    expect(scoreHand([6, 4, 5, 3, 6]).small_straight).toBe(30);
  });

  it('Corda (sequência de 5) também conta como Estrada', () => {
    expect(scoreHand([5, 3, 1, 4, 2]).small_straight).toBe(30);
    expect(scoreHand([6, 4, 2, 5, 3]).small_straight).toBe(30);
  });

  it('dá 0 sem 4 em sequência', () => {
    expect(scoreHand([1, 2, 3, 5, 6]).small_straight).toBe(0);
    expect(scoreHand([1, 2, 4, 5, 6]).small_straight).toBe(0);
    expect(scoreHand([1, 1, 2, 2, 3]).small_straight).toBe(0);
  });
});

describe('Corda (large_straight)', () => {
  it('vale 40 com 1-2-3-4-5 ou 2-3-4-5-6 em qualquer ordem', () => {
    expect(scoreHand([1, 2, 3, 4, 5]).large_straight).toBe(40);
    expect(scoreHand([5, 3, 1, 4, 2]).large_straight).toBe(40);
    expect(scoreHand([2, 3, 4, 5, 6]).large_straight).toBe(40);
    expect(scoreHand([6, 4, 2, 5, 3]).large_straight).toBe(40);
  });

  it('dá 0 com só 4 em sequência ou com buraco', () => {
    expect(scoreHand([4, 1, 3, 2, 2]).large_straight).toBe(0);
    expect(scoreHand([1, 2, 3, 4, 6]).large_straight).toBe(0);
    expect(scoreHand([1, 3, 4, 5, 6]).large_straight).toBe(0);
  });
});

describe('Kkakdugi (chance)', () => {
  it('soma todas as cartas, de 5 a 30', () => {
    expect(scoreHand([1, 1, 1, 1, 1]).chance).toBe(5);
    expect(scoreHand([6, 6, 6, 6, 6]).chance).toBe(30);
    expect(scoreHand([1, 2, 3, 4, 6]).chance).toBe(16);
  });
});

describe('mão completa', () => {
  it('full house 3,3,3,5,5', () => {
    expect(scoreHand([3, 3, 3, 5, 5])).toEqual({
      ones: 0,
      twos: 0,
      threes: 9,
      fours: 0,
      fives: 10,
      sixes: 0,
      pair: 10,
      three_kind: 9,
      four_kind: 0,
      two_pair: 15,
      full_house: 25,
      yar: 0,
      small_straight: 0,
      large_straight: 0,
      chance: 19,
    });
  });
});
