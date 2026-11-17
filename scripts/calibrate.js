/**
 * Calibração: para cada categoria e para 3 e 4 tiradas, simula muitos turnos
 * com o baralho real (funções do core) jogando só para aquela categoria com a
 * política de lookahead.js (ciente do baralho restante), e grava a média em
 * src/ai/expectedValues.js.
 *
 * Uso: npm run calibrate [-- --turns=10000 --seed=12345]
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGame, draw, toggleLock } from '../src/core/game.js';
import { CATEGORY_IDS, scoreHand } from '../src/core/scoring.js';
import { createSeededRng } from '../src/core/rng.js';
import { bestLocksForCategory, buildValueTables, deckCountsOf, warmUp } from '../src/ai/lookahead.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')),
);
const TURNS = Number(args.turns ?? 10000);
const SEED = Number(args.seed ?? 12345);
const DRAW_COUNTS = [3, 4];

function simulateTurn(baseState, categoryId, rng) {
  let state = draw(baseState, rng);
  while (state.turn.drawsUsed < state.maxDraws) {
    const left = state.maxDraws - state.turn.drawsUsed;
    // mesma ideia do Difícil: valor futuro calculado com o baralho restante
    const tables = buildValueTables({
      categoryIds: [categoryId],
      depth: left,
      deckCounts: deckCountsOf(state.turn.deck),
    });
    const locks = bestLocksForCategory(state.turn.hand, tables, categoryId, left);
    if (locks.every(Boolean)) break;
    locks.forEach((locked, i) => {
      if (state.turn.locked[i] !== locked) state = toggleLock(state, i);
    });
    state = draw(state, rng);
  }
  return scoreHand(state.turn.hand)[categoryId];
}

const started = Date.now();
warmUp();
const rng = createSeededRng(SEED);
const game = createGame({ modeId: 'full', players: [{ id: 'cal', name: 'cal' }] });
const result = {};

for (const maxDraws of DRAW_COUNTS) {
  const base = { ...game, maxDraws };
  result[maxDraws] = {};
  for (const categoryId of CATEGORY_IDS) {
    let sum = 0;
    for (let t = 0; t < TURNS; t++) sum += simulateTurn(base, categoryId, rng);
    result[maxDraws][categoryId] = Math.round((sum / TURNS) * 100) / 100;
  }
  console.log(`${maxDraws} tiradas:`, result[maxDraws]);
}

const body = DRAW_COUNTS.map(
  (d) =>
    `  ${d}: {\n${CATEGORY_IDS.map((id) => `    ${id}: ${result[d][id]},`).join('\n')}\n  },`,
).join('\n');

const file = `/**
 * GERADO por scripts/calibrate.js — não edite à mão (rode \`npm run calibrate\`).
 *
 * Valor esperado de cada categoria em um turno jogando só para ela, por número
 * de tiradas do modo. Simulação com o baralho real de 36 cartas.
 * Turnos por categoria: ${TURNS} · semente: ${SEED} · gerado em: ${new Date().toISOString().slice(0, 10)}
 */
export const EXPECTED_VALUES = {
${body}
};
`;

const target = fileURLToPath(new URL('../src/ai/expectedValues.js', import.meta.url));
writeFileSync(target, file);
console.log(`\nGravado em src/ai/expectedValues.js (${((Date.now() - started) / 1000).toFixed(1)} s)`);
