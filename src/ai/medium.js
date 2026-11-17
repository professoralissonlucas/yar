/**
 * Médio (Prof. Alishow — Exigente). Heurísticas por objetivo (sequência, full house, trinca/quadra)
 * e escolha de categoria comparando os pontos com o valor esperado da categoria.
 */

import { getEmptyCategories, getScoreOptions } from '../core/game.js';
import { LARGE_STRAIGHTS, NUMBER_CATEGORY_BY_VALUE, SMALL_STRAIGHTS } from '../core/scoring.js';
import {
  argmax,
  assertNpcTurn,
  countValues,
  drawAction,
  drawsLeft,
  expectedValuesFor,
  locksForValues,
  scoreAction,
} from './common.js';

/** Para de tirar quando a mão já vale isto acima do esperado numa categoria. */
const STOP_GAIN = 8;

/**
 * Custo extra de gastar estas categorias no começo da partida (diminui até 0
 * conforme a tabela enche): o Médio evita usar Yar! e Kkakdugi cedo.
 */
export const EARLY_PROTECTION = { yar: 4, chance: 3 };

/** Ganho de marcar `category` agora = pontos − valor esperado − proteção do começo. */
export function categoryGains(state, playerId) {
  const ev = expectedValuesFor(state.maxDraws);
  const options = getScoreOptions(state);
  const empty = getEmptyCategories(state, playerId);
  const earliness = state.categories.length > 1 ? (empty.length - 1) / (state.categories.length - 1) : 0;
  const protection = (c) => (EARLY_PROTECTION[c] ?? 0) * earliness;
  return { empty, gainOf: (c) => options[c] - ev[c] - protection(c) };
}

/** Uma carta de cada valor da janela de sequência que já está na mão. */
function straightLocks(hand, counts, empty) {
  const windows = [
    ...(empty.has('large_straight') ? LARGE_STRAIGHTS : []),
    ...(empty.has('small_straight') || empty.has('large_straight') ? SMALL_STRAIGHTS : []),
  ];
  let best = null;
  for (const window of windows) {
    const hits = window.filter((v) => counts[v] > 0);
    // prefere mais acertos; em empate, a janela maior (Corda)
    if (!best || hits.length > best.hits.length || (hits.length === best.hits.length && window.length > best.size)) {
      best = { hits, size: window.length };
    }
  }
  if (!best || best.hits.length < 3) return null;
  const used = new Set();
  return hand.map((v) => {
    if (best.hits.includes(v) && !used.has(v)) {
      used.add(v);
      return true;
    }
    return false;
  });
}

function chooseLocks(hand, empty) {
  const counts = countValues(hand);
  const maxCount = Math.max(...counts);
  const pairs = [1, 2, 3, 4, 5, 6].filter((v) => counts[v] >= 2);

  // Full house quando tem dois pares.
  if (empty.has('full_house') && pairs.length === 2) return locksForValues(hand, pairs);

  // Sequência quando tem 3–4 valores em sequência e nenhuma trinca.
  if (maxCount < 3) {
    const locks = straightLocks(hand, counts, empty);
    if (locks) return locks;
  }

  // Trinca/quadra: o valor mais repetido, preferindo valores altos e com a
  // categoria numérica ainda vazia.
  const score = (v) =>
    counts[v] * 10 + (empty.has(NUMBER_CATEGORY_BY_VALUE[v]) ? 3 : 0) + v * 0.5;
  let bestValue = 1;
  for (let v = 2; v <= 6; v++) if (score(v) > score(bestValue)) bestValue = v;

  if (counts[bestValue] >= 2) return locksForValues(hand, [bestValue]);
  if (empty.has(NUMBER_CATEGORY_BY_VALUE[bestValue])) return locksForValues(hand, [bestValue]);
  return hand.map(() => false);
}

export function decideAction(state, playerId, rng) {
  void rng; // o Médio é determinístico
  assertNpcTurn(state, playerId);
  if (state.turn.drawsUsed === 0) return drawAction();

  const { empty, gainOf } = categoryGains(state, playerId);
  const best = argmax(empty, gainOf);

  if (drawsLeft(state) === 0 || best.value >= STOP_GAIN) return scoreAction(best.category);

  const locks = chooseLocks(state.turn.hand, new Set(empty));
  if (locks.every(Boolean)) return scoreAction(best.category);
  return drawAction(locks);
}
