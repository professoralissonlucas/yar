/**
 * Torneio entre os NPCs no modo Completo.
 * Uso: npm run tournament [-- --games=500 --seed=2024 --mode=full]
 */

import { performance } from 'node:perf_hooks';
import { createGame, getCurrentPlayer, getWinners, isGameOver } from '../src/core/game.js';
import { createSeededRng } from '../src/core/rng.js';
import { NPCS, applyAction, getNpc } from '../src/ai/index.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')),
);
const GAMES = Number(args.games ?? 500);
const SEED = Number(args.seed ?? 2024);
const MODE = args.mode ?? 'full';
const PAIRINGS = [
  ['easy', 'medium'],
  ['medium', 'hard'],
  ['easy', 'hard'],
];

const rng = createSeededRng(SEED);
const decisionTimes = Object.fromEntries(NPCS.map((n) => [n.id, []]));
const overall = Object.fromEntries(NPCS.map((n) => [n.id, { games: 0, points: 0, wins: 0 }]));

function playGame(firstId, secondId) {
  let state = createGame({
    modeId: MODE,
    players: [
      { id: firstId, name: getNpc(firstId).name },
      { id: secondId, name: getNpc(secondId).name },
    ],
  });
  while (!isGameOver(state)) {
    const { id } = getCurrentPlayer(state);
    const t0 = performance.now();
    const action = getNpc(id).decideAction(state, id, rng);
    decisionTimes[id].push(performance.now() - t0);
    state = applyAction(state, action, rng);
  }
  return getWinners(state);
}

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const avg = (list) => list.reduce((a, b) => a + b, 0) / list.length;
const label = (id) => `${getNpc(id).label} (${getNpc(id).name})`;

console.log(`Torneio — modo ${MODE}, ${GAMES} partidas por confronto, semente ${SEED}\n`);
const started = performance.now();

for (const [a, b] of PAIRINGS) {
  const stats = { [a]: { points: 0, wins: 0 }, [b]: { points: 0, wins: 0 }, ties: 0 };
  for (let g = 0; g < GAMES; g++) {
    const [first, second] = g % 2 === 0 ? [a, b] : [b, a]; // alterna quem começa
    const { winnerIds, isTie, totals } = playGame(first, second);
    for (const id of [a, b]) {
      stats[id].points += totals[id];
      overall[id].points += totals[id];
      overall[id].games++;
    }
    if (isTie) stats.ties++;
    else {
      stats[winnerIds[0]].wins++;
      overall[winnerIds[0]].wins++;
    }
  }
  console.log(`${label(a)} × ${label(b)}`);
  for (const id of [a, b]) {
    console.log(
      `  ${label(id).padEnd(18)} média ${(stats[id].points / GAMES).toFixed(1).padStart(6)} pts · vitórias ${pct(stats[id].wins, GAMES).padStart(6)}`,
    );
  }
  console.log(`  empates ${pct(stats.ties, GAMES)}\n`);
}

console.log('Geral');
for (const { id } of NPCS) {
  const o = overall[id];
  console.log(
    `  ${label(id).padEnd(18)} média ${(o.points / o.games).toFixed(1).padStart(6)} pts · vitórias ${pct(o.wins, o.games).padStart(6)} (${o.games} partidas)`,
  );
}

const hardTimes = decisionTimes.hard;
console.log(
  `\nTempo por decisão do Difícil: média ${avg(hardTimes).toFixed(2)} ms · máximo ${Math.max(...hardTimes).toFixed(2)} ms (${hardTimes.length} decisões)`,
);
console.log(`Duração total: ${((performance.now() - started) / 1000).toFixed(1)} s`);
