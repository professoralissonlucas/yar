/** Textos de exibição. As regras de verdade ficam em src/core/scoring.js. */

import { FIXED_SCORES, getCategory } from '../core/scoring.js';

export const CATEGORY_RULES = {
  ones: 'Soma das cartas A (1).',
  twos: 'Soma das cartas 2.',
  threes: 'Soma das cartas 3.',
  fours: 'Soma das cartas 4.',
  fives: 'Soma das cartas 5.',
  sixes: 'Soma das cartas 6.',
  pair: 'Pelo menos 2 iguais: soma só do par de maior valor.',
  three_kind: 'Pelo menos 3 iguais: soma só dessas 3.',
  four_kind: 'Pelo menos 4 iguais: soma só dessas 4.',
  two_pair: `Dois pares de valores diferentes: ${FIXED_SCORES.two_pair} pontos.`,
  full_house: `3 de um valor + 2 de outro: ${FIXED_SCORES.full_house} pontos.`,
  yar: `5 cartas iguais: ${FIXED_SCORES.yar} pontos.`,
  small_straight: `4 valores em sequência: ${FIXED_SCORES.small_straight} pontos.`,
  large_straight: `5 valores em sequência: ${FIXED_SCORES.large_straight} pontos.`,
  chance: 'Soma de todas as cartas.',
};

/** Inicial do nome (para o círculo do jogador). */
export function initialOf(name) {
  const first = [...String(name ?? '').trim()][0];
  return first ? first.toLocaleUpperCase('pt-BR') : '?';
}

export function categoryName(id) {
  return getCategory(id).name;
}

export function categoryTooltip(id) {
  const { min, max } = getCategory(id);
  return `${CATEGORY_RULES[id]} (${min}–${max})`;
}

export function stars(count, max = 5) {
  return '★'.repeat(count) + '☆'.repeat(Math.max(0, max - count));
}

export function pluralize(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}
