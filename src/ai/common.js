/** Utilidades compartilhadas pelos NPCs. */

import { HAND_SIZE } from '../core/deck.js';
import { getCurrentPlayer } from '../core/game.js';
import { EXPECTED_VALUES } from './expectedValues.js';

export function noLocks() {
  return Array(HAND_SIZE).fill(false);
}

export function drawAction(locks = noLocks()) {
  return { type: 'draw', locks };
}

export function scoreAction(category) {
  return { type: 'score', category };
}

export function assertNpcTurn(state, playerId) {
  if (state.status !== 'playing') throw new Error('A partida já terminou');
  if (getCurrentPlayer(state).id !== playerId) {
    throw new Error(`Não é a vez de ${playerId}`);
  }
}

export function drawsLeft(state) {
  return state.maxDraws - state.turn.drawsUsed;
}

/** Categoria de maior valor; empate → a primeira da lista (ordem do modo). */
export function argmax(categories, valueOf) {
  let best = categories[0];
  let bestValue = -Infinity;
  for (const c of categories) {
    const value = valueOf(c);
    if (value > bestValue) {
      best = c;
      bestValue = value;
    }
  }
  return { category: best, value: bestValue };
}

/** Tabela de valor esperado para o número de tiradas do modo. */
export function expectedValuesFor(maxDraws) {
  if (EXPECTED_VALUES[maxDraws]) return EXPECTED_VALUES[maxDraws];
  const available = Object.keys(EXPECTED_VALUES).map(Number);
  const closest = available.reduce((a, b) => (Math.abs(b - maxDraws) < Math.abs(a - maxDraws) ? b : a));
  return EXPECTED_VALUES[closest];
}

/** Quantidade de cartas de cada valor na mão: counts[v]. */
export function countValues(hand) {
  const counts = Array(7).fill(0);
  for (const v of hand) counts[v]++;
  return counts;
}

export function locksForValues(hand, values) {
  const wanted = new Set(values);
  return hand.map((v) => wanted.has(v));
}
