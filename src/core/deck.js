/** Baralho: cartas são números de 1 a 6 (o 1 é exibido como "A" pela interface). */

export const CARD_VALUES = [1, 2, 3, 4, 5, 6];
export const DECK_COPIES_PER_VALUE = 6;
export const HAND_SIZE = 5;

/** Cria um baralho ordenado com `copiesPerValue` cartas de cada valor. */
export function createDeck(copiesPerValue = DECK_COPIES_PER_VALUE) {
  if (!Number.isInteger(copiesPerValue) || copiesPerValue < 1) {
    throw new RangeError(`createDeck: cópias por valor inválidas (${copiesPerValue})`);
  }
  const deck = [];
  for (const value of CARD_VALUES) {
    for (let i = 0; i < copiesPerValue; i++) deck.push(value);
  }
  return deck;
}

/** Embaralha (Fisher–Yates) e devolve um novo array; não altera `cards`. */
export function shuffle(cards, rng) {
  if (typeof rng !== 'function') throw new TypeError('shuffle: rng deve ser uma função');
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Tira `count` cartas do topo. Devolve `{ drawn, deck }`, onde `deck` é o restante. */
export function drawCards(deck, count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`drawCards: quantidade inválida (${count})`);
  }
  if (count > deck.length) {
    throw new RangeError(`drawCards: o baralho tem ${deck.length} cartas, pedidas ${count}`);
  }
  return { drawn: deck.slice(0, count), deck: deck.slice(count) };
}
