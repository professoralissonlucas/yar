/**
 * Motor de antecipação compartilhado pelos NPCs e pela calibração.
 *
 * buildValueTables calcula, por programação dinâmica sobre multiconjuntos de
 * cartas, V[r][mão][categoria] = pontos esperados numa categoria jogando só
 * para ela com `r` tiradas restantes. As probabilidades das cartas novas vêm da
 * composição do baralho informada (sem reposição); sem baralho, usa o modelo
 * "dados" (1/6 por valor). Usa apenas scoreHand do core.
 *
 * Aproximação: todas as tiradas futuras usam a composição do baralho do momento
 * da decisão (ignora o que sai nas próprias tiradas futuras).
 */

import { CARD_VALUES, HAND_SIZE } from '../core/deck.js';
import { CATEGORY_IDS, scoreHand } from '../core/scoring.js';

/** Maior número de tiradas restantes depois da 1ª (modos de 4 tiradas). */
export const MAX_DRAWS_LEFT = 3;

const NUM_VALUES = CARD_VALUES.length;
/** Código de um multiconjunto = Σ quantidade(v) · 6^(v−1). Sem "vai um", pois o total ≤ 5. */
const POW = CARD_VALUES.map((_, i) => 6 ** i);
const CODE_SPACE = 6 ** NUM_VALUES;

export function cardCode(value) {
  return POW[value - 1];
}

export function codeOfCards(cards) {
  let code = 0;
  for (const v of cards) code += POW[v - 1];
  return code;
}

/** Quantidade de cada valor no baralho: counts[v − 1]. */
export function deckCountsOf(deck) {
  const counts = Array(NUM_VALUES).fill(0);
  for (const v of deck) counts[v - 1]++;
  return counts;
}

function factorial(n) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

function binomialSlow(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** C(n, k) para n ≤ MAX_N e k ≤ 5, pré-calculado. */
const MAX_N = 64;
const BINOMIALS = Array.from({ length: MAX_N + 1 }, (_, n) =>
  Float64Array.from({ length: HAND_SIZE + 1 }, (_, k) => binomialSlow(n, k)),
);
function binomial(n, k) {
  return n <= MAX_N ? BINOMIALS[n][k] : binomialSlow(n, k);
}

// ---------- estrutura fixa (calculada uma vez) ----------

let structure = null;

function getStructure() {
  if (structure) return structure;

  const multisets = []; // 462 multiconjuntos de 0 a 5 cartas
  const counts = Array(NUM_VALUES).fill(0);
  (function rec(valueIndex, size) {
    if (valueIndex === NUM_VALUES) {
      const cards = [];
      counts.forEach((c, i) => {
        for (let k = 0; k < c; k++) cards.push(i + 1);
      });
      const ways = factorial(size) / counts.reduce((acc, c) => acc * factorial(c), 1);
      multisets.push({ size, cards, counts: [...counts], code: codeOfCards(cards), diceProb: ways / 6 ** size });
      return;
    }
    for (let c = 0; size + c <= HAND_SIZE; c++) {
      counts[valueIndex] = c;
      rec(valueIndex + 1, size + c);
    }
    counts[valueIndex] = 0;
  })(0, 0);

  const keepIndexByCode = new Int16Array(CODE_SPACE).fill(-1);
  multisets.forEach((m, i) => {
    keepIndexByCode[m.code] = i;
  });

  const hands = multisets.filter((m) => m.size === HAND_SIZE); // 252
  const handIndexByCode = new Int16Array(CODE_SPACE).fill(-1);
  hands.forEach((m, i) => {
    handIndexByCode[m.code] = i;
  });

  // Transições achatadas: para o mantido k, as posições transStart[k]..transStart[k+1]
  // guardam (resultado da tirada, mão final).
  const pairs = [];
  const transStart = new Int32Array(multisets.length + 1);
  multisets.forEach((keep, k) => {
    transStart[k] = pairs.length;
    multisets.forEach((outcome, o) => {
      if (outcome.size === HAND_SIZE - keep.size) pairs.push([o, handIndexByCode[keep.code + outcome.code]]);
    });
  });
  transStart[multisets.length] = pairs.length;
  const transOutcome = Int16Array.from(pairs, ([o]) => o);
  const transHand = Int16Array.from(pairs, ([, h]) => h);
  const multisetSize = Int8Array.from(multisets, (m) => m.size);
  const multisetCounts = multisets.map((m) => Int8Array.from(m.counts));

  // Sub-multiconjuntos (possíveis "cartas mantidas") de cada mão, sem repetição.
  const subKeeps = hands.map((hand) => {
    const codes = new Set();
    for (let mask = 0; mask < 1 << HAND_SIZE; mask++) {
      let code = 0;
      for (let i = 0; i < HAND_SIZE; i++) if (mask & (1 << i)) code += POW[hand.cards[i] - 1];
      codes.add(code);
    }
    return Int16Array.from([...codes].map((c) => keepIndexByCode[c]));
  });

  // Pontuação (core) de cada mão em cada categoria.
  const scores = hands.map((hand) => scoreHand(hand.cards));

  const diceProbs = Float64Array.from(multisets, (m) => m.diceProb);

  structure = {
    multisets,
    hands,
    keepIndexByCode,
    handIndexByCode,
    transStart,
    transOutcome,
    transHand,
    multisetSize,
    multisetCounts,
    diceProbs,
    subKeeps,
    scores,
  };
  return structure;
}

/** Probabilidade de cada multiconjunto sair ao tirar |m| cartas do baralho. */
function outcomeProbabilities(deckCounts) {
  const { multisetSize, multisetCounts, diceProbs } = getStructure();
  if (!deckCounts) return diceProbs;
  const probs = new Float64Array(multisetSize.length);
  let total = 0;
  for (let v = 0; v < NUM_VALUES; v++) total += deckCounts[v];
  const denominators = Float64Array.from({ length: HAND_SIZE + 1 }, (_, n) => binomial(total, n));
  for (let i = 0; i < probs.length; i++) {
    const denominator = denominators[multisetSize[i]];
    if (denominator === 0) continue;
    const counts = multisetCounts[i];
    let ways = 1;
    for (let v = 0; v < NUM_VALUES && ways > 0; v++) ways *= binomial(deckCounts[v], counts[v]);
    probs[i] = ways / denominator;
  }
  return probs;
}

/**
 * Tabelas de valor para as categorias pedidas.
 * @param {{ categoryIds?: string[], depth?: number, deckCounts?: number[] | null }} options
 *   depth = maior nº de tiradas restantes a calcular (V[0..depth]).
 * @returns {{ V: Float64Array[], W: Float64Array[], columns: Record<string, number>, width: number }}
 *   V[r][mão·width + coluna], W[r][mantidas·width + coluna].
 */
export function buildValueTables({ categoryIds = CATEGORY_IDS, depth = MAX_DRAWS_LEFT, deckCounts = null } = {}) {
  const { multisets, hands, transStart, transOutcome, transHand, subKeeps, scores } = getStructure();
  const width = categoryIds.length;
  const columns = Object.fromEntries(categoryIds.map((id, c) => [id, c]));
  const probs = outcomeProbabilities(deckCounts);

  const v0 = new Float64Array(hands.length * width);
  hands.forEach((_, h) => {
    for (let c = 0; c < width; c++) v0[h * width + c] = scores[h][categoryIds[c]];
  });
  const V = [v0];
  const W = [];

  for (let r = 0; r < depth; r++) {
    // W[r][k] = valor esperado de manter k, tirar o resto e ficar com r tiradas depois.
    const vr = V[r];
    const w = new Float64Array(multisets.length * width);
    for (let k = 0; k < multisets.length; k++) {
      const row = k * width;
      for (let t = transStart[k]; t < transStart[k + 1]; t++) {
        const p = probs[transOutcome[t]];
        if (p === 0) continue;
        const from = transHand[t] * width;
        for (let c = 0; c < width; c++) w[row + c] += p * vr[from + c];
      }
    }
    W.push(w);

    const next = new Float64Array(hands.length * width);
    for (let h = 0; h < hands.length; h++) {
      const keeps = subKeeps[h];
      for (let c = 0; c < width; c++) {
        let best = 0;
        for (let i = 0; i < keeps.length; i++) {
          const value = w[keeps[i] * width + c];
          if (value > best) best = value;
        }
        next[h * width + c] = best;
      }
    }
    V.push(next);
  }

  return { V, W, columns, width };
}

export function handIndexOf(handCode) {
  return getStructure().handIndexByCode[handCode];
}

/** Pontos esperados na categoria a partir de uma mão de 5 cartas com `drawsLeft` tiradas. */
export function handValue(tables, handCode, categoryId, drawsLeft) {
  return tables.V[drawsLeft][handIndexOf(handCode) * tables.width + tables.columns[categoryId]];
}

/** Valor esperado de manter `keepCode`, tirar o resto e ainda ter `drawsLeftAfter` tiradas. */
export function keepValue(tables, keepCode, categoryId, drawsLeftAfter) {
  const k = getStructure().keepIndexByCode[keepCode];
  return tables.W[drawsLeftAfter][k * tables.width + tables.columns[categoryId]];
}

/**
 * Melhor conjunto de cartas para trancar mirando só uma categoria
 * (`tables` precisa ter depth ≥ drawsLeft). Devolve 5 booleanos; todos true = parar.
 */
export function bestLocksForCategory(hand, tables, categoryId, drawsLeft) {
  let bestMask = (1 << HAND_SIZE) - 1;
  let bestValue = -Infinity;
  for (let mask = (1 << HAND_SIZE) - 1; mask >= 0; mask--) {
    let code = 0;
    for (let i = 0; i < HAND_SIZE; i++) if (mask & (1 << i)) code += POW[hand[i] - 1];
    const value = keepValue(tables, code, categoryId, drawsLeft - 1);
    if (value > bestValue + 1e-12) {
      bestValue = value;
      bestMask = mask;
    }
  }
  return Array.from({ length: HAND_SIZE }, (_, i) => Boolean(bestMask & (1 << i)));
}

/** Pré-calcula a estrutura fixa (útil para aquecer antes da 1ª decisão). */
export function warmUp() {
  getStructure();
}
