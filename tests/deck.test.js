import { describe, expect, it } from 'vitest';
import { createDeck, drawCards, shuffle, DECK_COPIES_PER_VALUE } from '../src/core/deck.js';
import { createSeededRng } from '../src/core/rng.js';

function countByValue(cards) {
  const counts = {};
  for (const c of cards) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}

describe('createDeck', () => {
  it('cria 36 cartas, 6 de cada valor de 1 a 6', () => {
    const deck = createDeck();
    expect(DECK_COPIES_PER_VALUE).toBe(6);
    expect(deck).toHaveLength(36);
    expect(countByValue(deck)).toEqual({ 1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 6: 6 });
  });

  it('aceita outro número de cópias', () => {
    expect(createDeck(2)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(() => createDeck(0)).toThrow();
  });
});

describe('shuffle', () => {
  it('não altera o baralho original e mantém as mesmas cartas', () => {
    const deck = createDeck();
    const copy = [...deck];
    const shuffled = shuffle(deck, createSeededRng(42));
    expect(deck).toEqual(copy);
    expect([...shuffled].sort()).toEqual([...deck].sort());
    expect(shuffled).not.toEqual(deck);
  });

  it('é determinístico para a mesma seed', () => {
    const a = shuffle(createDeck(), createSeededRng(7));
    const b = shuffle(createDeck(), createSeededRng(7));
    const c = shuffle(createDeck(), createSeededRng(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('usa o rng recebido (rng ~1 mantém a ordem)', () => {
    const deck = createDeck();
    expect(shuffle(deck, () => 0.999999)).toEqual(deck);
  });

  it('exige um rng', () => {
    expect(() => shuffle(createDeck())).toThrow();
  });
});

describe('drawCards', () => {
  it('tira do topo e devolve o restante', () => {
    const deck = [1, 2, 3, 4, 5, 6, 1];
    const { drawn, deck: rest } = drawCards(deck, 5);
    expect(drawn).toEqual([1, 2, 3, 4, 5]);
    expect(rest).toEqual([6, 1]);
    expect(deck).toHaveLength(7);
  });

  it('tirar 0 cartas não muda nada', () => {
    expect(drawCards([1, 2], 0)).toEqual({ drawn: [], deck: [1, 2] });
  });

  it('falha se não houver cartas suficientes ou quantidade inválida', () => {
    expect(() => drawCards([1, 2], 3)).toThrow();
    expect(() => drawCards([1, 2], -1)).toThrow();
  });
});

describe('createSeededRng', () => {
  it('gera números em [0, 1)', () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 1000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
