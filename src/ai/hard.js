/**
 * Difícil — Islin. Para cada combinação de cartas trancadas, simula ~200
 * tiradas sorteando do baralho restante do turno (sem olhar a ordem real) e
 * avalia a mão resultante com tabelas de antecipação calculadas para a
 * composição atual do baralho (lookahead.js), considerando só as categorias
 * vazias e valorizando as raras.
 */

import { HAND_SIZE } from '../core/deck.js';
import { getEmptyCategories, getScoreOptions } from '../core/game.js';
import { argmax, assertNpcTurn, drawAction, drawsLeft, expectedValuesFor, scoreAction } from './common.js';
import { buildValueTables, cardCode, deckCountsOf, handIndexOf } from './lookahead.js';

export const DEFAULT_SAMPLES = 200;
/** Pesos > 1 valorizam categorias raras. */
export const RARE_WEIGHTS = { yar: 1.25, large_straight: 1.1 };

const ALL_LOCKED = (1 << HAND_SIZE) - 1;

export function createHard({ samples = DEFAULT_SAMPLES, weights = RARE_WEIGHTS } = {}) {
  function decideAction(state, playerId, rng) {
    assertNpcTurn(state, playerId);
    if (state.turn.drawsUsed === 0) return drawAction();

    const ev = expectedValuesFor(state.maxDraws);
    const empty = getEmptyCategories(state, playerId);
    const weightOf = (c) => weights[c] ?? 1;
    const utility = (c, points) => weightOf(c) * (points - ev[c]);

    const options = getScoreOptions(state);
    const stop = argmax(empty, (c) => utility(c, options[c]));
    const left = drawsLeft(state);
    if (left === 0) return scoreAction(stop.category);

    const { hand, deck } = state.turn;
    // Valor futuro (depois desta tirada ainda restam left − 1) com o baralho atual.
    const tables = buildValueTables({
      categoryIds: empty,
      depth: left - 1,
      deckCounts: deckCountsOf(deck),
    });
    const values = tables.V[left - 1];
    const width = tables.width;
    const catWeight = empty.map(weightOf);
    const catEv = empty.map((c) => ev[c]);

    const scratch = deck.slice();
    const deckSize = deck.length;
    const seen = new Set();
    let bestMask = ALL_LOCKED;
    let bestValue = stop.value;

    for (let mask = 0; mask < ALL_LOCKED; mask++) {
      let keptCode = 0;
      let drawCount = 0;
      for (let i = 0; i < HAND_SIZE; i++) {
        if (mask & (1 << i)) keptCode += cardCode(hand[i]);
        else drawCount++;
      }
      if (seen.has(keptCode) || drawCount > deckSize) continue;
      seen.add(keptCode);

      let total = 0;
      for (let s = 0; s < samples; s++) {
        // Fisher–Yates parcial: sorteia `drawCount` cartas do baralho restante.
        let code = keptCode;
        for (let k = 0; k < drawCount; k++) {
          const j = k + Math.floor(rng() * (deckSize - k));
          const tmp = scratch[k];
          scratch[k] = scratch[j];
          scratch[j] = tmp;
          code += cardCode(scratch[k]);
        }
        const base = handIndexOf(code) * width;
        let best = -Infinity;
        for (let c = 0; c < width; c++) {
          const u = catWeight[c] * (values[base + c] - catEv[c]);
          if (u > best) best = u;
        }
        total += best;
      }
      const value = total / samples;
      if (value > bestValue) {
        bestValue = value;
        bestMask = mask;
      }
    }

    if (bestMask === ALL_LOCKED) return scoreAction(stop.category);
    return drawAction(Array.from({ length: HAND_SIZE }, (_, i) => Boolean(bestMask & (1 << i))));
  }

  return { decideAction };
}

export const { decideAction } = createHard();
