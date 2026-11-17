/** Textos de exibição. As regras de verdade ficam em src/core/scoring.js. */

import { FIXED_SCORES, getCategory, scoreCategory } from '../core/scoring.js';

/**
 * Explicação de cada categoria (dica da tabela).
 * - rule: a regra em uma frase.
 * - points: como pontua (o "máx." é acrescentado a partir de scoring.js).
 * - example: 5 cartas de exemplo; os pontos são calculados pelo core.
 */
export const CATEGORY_HELP = {
  ones: { rule: 'Conta só as cartas A (cada A vale 1).', points: 'Vale a soma das cartas A', example: [1, 1, 4, 1, 6] },
  twos: { rule: 'Conta só as cartas 2.', points: 'Vale a soma das cartas 2', example: [2, 5, 2, 3, 2] },
  threes: { rule: 'Conta só as cartas 3.', points: 'Vale a soma das cartas 3', example: [3, 3, 6, 1, 3] },
  fours: { rule: 'Conta só as cartas 4.', points: 'Vale a soma das cartas 4', example: [4, 2, 4, 4, 5] },
  fives: { rule: 'Conta só as cartas 5.', points: 'Vale a soma das cartas 5', example: [5, 5, 1, 5, 3] },
  sixes: { rule: 'Conta só as cartas 6.', points: 'Vale a soma das cartas 6', example: [6, 6, 2, 6, 4] },
  pair: {
    rule: 'Pelo menos 2 cartas iguais; vale o par mais alto.',
    points: 'Vale a soma das 2 cartas do par',
    example: [6, 6, 3, 3, 1],
  },
  three_kind: { rule: 'Pelo menos 3 cartas iguais.', points: 'Vale a soma das 3 cartas iguais', example: [5, 5, 5, 2, 6] },
  four_kind: { rule: 'Pelo menos 4 cartas iguais.', points: 'Vale a soma das 4 cartas iguais', example: [4, 4, 4, 4, 2] },
  two_pair: {
    rule: 'Dois pares de valores diferentes (um full house também vale).',
    points: `Vale ${FIXED_SCORES.two_pair} pontos`,
    example: [3, 3, 5, 5, 1],
  },
  full_house: {
    rule: 'Exatamente 3 cartas de um valor e 2 de outro.',
    points: `Vale ${FIXED_SCORES.full_house} pontos`,
    example: [2, 2, 2, 6, 6],
  },
  yar: { rule: 'As 5 cartas iguais.', points: `Vale ${FIXED_SCORES.yar} pontos`, example: [4, 4, 4, 4, 4] },
  small_straight: {
    rule: '4 valores em sequência, em qualquer ordem (A-2-3-4, 2-3-4-5 ou 3-4-5-6).',
    points: `Vale ${FIXED_SCORES.small_straight} pontos`,
    example: [3, 1, 4, 2, 6],
  },
  large_straight: {
    rule: '5 valores em sequência, em qualquer ordem (A-2-3-4-5 ou 2-3-4-5-6).',
    points: `Vale ${FIXED_SCORES.large_straight} pontos`,
    example: [5, 2, 4, 6, 3],
  },
  chance: { rule: 'Qualquer mão: somam-se todas as cartas.', points: 'Vale a soma das 5 cartas', example: [6, 5, 4, 2, 1] },
};

/**
 * Dados da dica de uma categoria.
 * `handPoints`: pontos da mão atual nessa categoria (número) ou null.
 */
export function categoryHelp(id, handPoints = null) {
  const { name, max } = getCategory(id);
  const help = CATEGORY_HELP[id];
  const fixed = id in FIXED_SCORES;
  return {
    name,
    rule: help.rule,
    pointsLine: fixed ? help.points : `${help.points} · máx. ${max}`,
    example: help.example,
    exampleScore: scoreCategory(help.example, id),
    handLine: typeof handPoints === 'number' ? `Sua mão agora: ${pluralize(handPoints, 'ponto', 'pontos')}` : null,
  };
}

/** A dica em texto corrido (para leitores de tela, via aria-describedby). */
export function categoryDescription(id, handPoints = null) {
  const help = categoryHelp(id, handPoints);
  const cards = help.example.map((v) => (v === 1 ? 'A' : String(v))).join(', ');
  return [
    help.rule,
    `${help.pointsLine}.`,
    `Exemplo: ${cards} vale ${pluralize(help.exampleScore, 'ponto', 'pontos')}.`,
    help.handLine && `${help.handLine}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Inicial do nome (para o círculo do jogador). */
export function initialOf(name) {
  const first = [...String(name ?? '').trim()][0];
  return first ? first.toLocaleUpperCase('pt-BR') : '?';
}

export function categoryName(id) {
  return getCategory(id).name;
}

export function stars(count, max = 5) {
  return '★'.repeat(count) + '☆'.repeat(Math.max(0, max - count));
}

export function pluralize(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}
