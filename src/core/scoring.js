/**
 * Pontuação das 15 categorias.
 * A ordem de CATEGORIES também é a ordem de "menor potencial" usada quando o
 * tempo acaba e é preciso zerar uma categoria.
 */

export const CATEGORIES = [
  { id: 'ones', name: 'Fragmento Um', min: 0, max: 5 },
  { id: 'twos', name: 'Dois Pacotes', min: 0, max: 10 },
  { id: 'threes', name: 'Três Pacotes', min: 0, max: 15 },
  { id: 'fours', name: 'Quatro Motivos', min: 0, max: 20 },
  { id: 'fives', name: 'Cinco Caroços', min: 0, max: 25 },
  { id: 'sixes', name: 'Seis Buquês', min: 0, max: 30 },
  { id: 'pair', name: 'Parceiro', min: 0, max: 12 },
  { id: 'three_kind', name: 'Pico', min: 0, max: 18 },
  { id: 'four_kind', name: 'Garra de Dragão', min: 0, max: 24 },
  { id: 'two_pair', name: 'Rude', min: 0, max: 15 },
  { id: 'full_house', name: 'Sedução do Lobo', min: 0, max: 25 },
  { id: 'yar', name: 'Yar!', min: 0, max: 50 },
  { id: 'small_straight', name: 'Estrada Bifurcada', min: 0, max: 30 },
  { id: 'large_straight', name: 'Corda', min: 0, max: 40 },
  { id: 'chance', name: 'Kkakdugi', min: 5, max: 30 },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id) {
  const category = CATEGORY_BY_ID[id];
  if (!category) throw new Error(`Categoria desconhecida: ${id}`);
  return category;
}

/** Pontos das categorias de valor fixo (tudo ou nada). */
export const FIXED_SCORES = {
  two_pair: 15,
  full_house: 25,
  yar: 50,
  small_straight: 30,
  large_straight: 40,
};

const SMALL_STRAIGHTS = [
  [1, 2, 3, 4],
  [2, 3, 4, 5],
  [3, 4, 5, 6],
];
const LARGE_STRAIGHTS = [
  [1, 2, 3, 4, 5],
  [2, 3, 4, 5, 6],
];

function validateHand(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) {
    throw new Error('A mão deve ter exatamente 5 cartas');
  }
  for (const c of cards) {
    if (!Number.isInteger(c) || c < 1 || c > 6) throw new Error(`Carta inválida: ${c}`);
  }
}

/** counts[v] = quantidade de cartas de valor v (índices 1..6; índice 0 não usado). */
function countValues(cards) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const c of cards) counts[c]++;
  return counts;
}

/** Maior valor que aparece pelo menos `n` vezes, ou 0 se nenhum. */
function highestWithAtLeast(counts, n) {
  for (let v = 6; v >= 1; v--) if (counts[v] >= n) return v;
  return 0;
}

function containsAll(counts, values) {
  return values.every((v) => counts[v] > 0);
}

/** Recebe 5 cartas e devolve a pontuação de cada uma das 15 categorias. */
export function scoreHand(cards) {
  validateHand(cards);
  const counts = countValues(cards);
  const sum = cards.reduce((a, b) => a + b, 0);
  const groupSizes = counts
    .slice(1)
    .filter((n) => n > 0)
    .sort((a, b) => b - a);
  const valuesWithPair = counts.slice(1).filter((n) => n >= 2).length;
  const isFullHouse = groupSizes.length === 2 && groupSizes[0] === 3 && groupSizes[1] === 2;

  return {
    ones: counts[1] * 1,
    twos: counts[2] * 2,
    threes: counts[3] * 3,
    fours: counts[4] * 4,
    fives: counts[5] * 5,
    sixes: counts[6] * 6,
    pair: highestWithAtLeast(counts, 2) * 2,
    three_kind: highestWithAtLeast(counts, 3) * 3,
    four_kind: highestWithAtLeast(counts, 4) * 4,
    two_pair: valuesWithPair >= 2 ? FIXED_SCORES.two_pair : 0,
    full_house: isFullHouse ? FIXED_SCORES.full_house : 0,
    yar: groupSizes[0] === 5 ? FIXED_SCORES.yar : 0,
    small_straight: SMALL_STRAIGHTS.some((s) => containsAll(counts, s))
      ? FIXED_SCORES.small_straight
      : 0,
    large_straight: LARGE_STRAIGHTS.some((s) => containsAll(counts, s))
      ? FIXED_SCORES.large_straight
      : 0,
    chance: sum,
  };
}

/** Pontuação de uma única categoria. */
export function scoreCategory(cards, categoryId) {
  getCategory(categoryId);
  return scoreHand(cards)[categoryId];
}
