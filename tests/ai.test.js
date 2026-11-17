import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { NPCS, applyAction, getNpc } from '../src/ai/index.js';
import { createHard } from '../src/ai/hard.js';
import { decideAction as easyDecide } from '../src/ai/easy.js';
import { categoryGains, decideAction as mediumDecide } from '../src/ai/medium.js';
import { EXPECTED_VALUES } from '../src/ai/expectedValues.js';
import { buildValueTables, codeOfCards, handValue, keepValue, warmUp } from '../src/ai/lookahead.js';
import { createGame, draw, getCurrentPlayer, getEmptyCategories, isGameOver } from '../src/core/game.js';
import { MODES } from '../src/core/modes.js';
import { CATEGORIES, CATEGORY_IDS, scoreHand } from '../src/core/scoring.js';
import { createSeededRng } from '../src/core/rng.js';

const fastHard = createHard({ samples: 40 });
const DECIDERS = {
  easy: easyDecide,
  medium: mediumDecide,
  hard: fastHard.decideAction,
};

/** Estado do jogador "npc" com uma mão escolhida. */
function stateWithHand(hand, { modeId = 'full', drawsUsed = 1, filled = {}, deck } = {}) {
  const base = createGame({ modeId, players: [{ id: 'npc', name: 'NPC' }, { id: 'h', name: 'H' }] });
  const fullDeck = [];
  for (let v = 1; v <= 6; v++) for (let k = 0; k < 6; k++) fullDeck.push(v);
  for (const v of hand) fullDeck.splice(fullDeck.indexOf(v), 1);
  return {
    ...base,
    scores: { ...base.scores, npc: { ...base.scores.npc, ...filled } },
    turn: { deck: deck ?? fullDeck, hand, locked: [false, false, false, false, false], drawsUsed },
  };
}

/** Joga uma partida inteira validando cada ação antes de aplicá-la. */
function playValidatedGame(modeId, [idA, idB], seed) {
  const rng = createSeededRng(seed);
  let state = createGame({ modeId, players: [{ id: idA, name: idA }, { id: idB, name: idB }] });
  const deciders = { [idA]: DECIDERS[idA.split(':')[0]], [idB]: DECIDERS[idB.split(':')[0]] };
  const maxActions = state.categories.length * 2 * (state.maxDraws + 1);
  let actions = 0;

  while (!isGameOver(state)) {
    const { id } = getCurrentPlayer(state);
    const action = deciders[id](state, id, rng);
    const { turn } = state;

    if (action.type === 'draw') {
      expect(action.locks).toHaveLength(5);
      action.locks.forEach((l) => expect(typeof l).toBe('boolean'));
      expect(turn.drawsUsed).toBeLessThan(state.maxDraws);
      if (turn.drawsUsed === 0) expect(action.locks.some(Boolean)).toBe(false);
      else expect(action.locks.every(Boolean)).toBe(false);
    } else {
      expect(action.type).toBe('score');
      expect(turn.drawsUsed).toBeGreaterThan(0);
      expect(getEmptyCategories(state, id)).toContain(action.category);
    }

    state = applyAction(state, action, rng); // o core lança erro em jogada inválida
    actions++;
    expect(actions).toBeLessThanOrEqual(maxActions);
  }

  for (const p of state.players) {
    expect(getEmptyCategories(state, p.id)).toEqual([]);
  }
  return state;
}

describe('NPCs — partidas completas sem jogadas inválidas', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    for (const mode of MODES) {
      it(`${level} no modo ${mode.id}`, () => {
        for (const seed of [1, 2]) {
          const opponent = level === 'easy' ? 'medium' : 'easy';
          playValidatedGame(mode.id, [`${level}:a`, `${opponent}:b`], seed * 100 + mode.stars);
          playValidatedGame(mode.id, [`${opponent}:a`, `${level}:b`], seed * 200 + mode.stars);
        }
      });
    }
  }

  it('Difícil com 200 amostras termina uma partida completa', () => {
    DECIDERS['hard200'] = getNpc('hard').decideAction;
    playValidatedGame('full', ['hard200:a', 'medium:b'], 42);
  });
});

describe('interface comum', () => {
  it('NPCS tem os 3 níveis com nomes do CLAUDE.md', () => {
    expect(NPCS.map((n) => [n.id, n.name])).toEqual([
      ['easy', 'Igor'],
      ['medium', 'Eileen'],
      ['hard', 'Islin'],
    ]);
    expect(() => getNpc('xyz')).toThrow();
  });

  it('1ª tirada é sempre "draw" sem travas', () => {
    const state = createGame({ modeId: 'full', players: [{ id: 'npc', name: 'N' }] });
    for (const npc of NPCS) {
      expect(npc.decideAction(state, 'npc', createSeededRng(1))).toEqual({
        type: 'draw',
        locks: [false, false, false, false, false],
      });
    }
  });

  it('recusa decidir fora da vez', () => {
    const state = createGame({ modeId: 'full', players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
    for (const npc of NPCS) expect(() => npc.decideAction(state, 'b', Math.random)).toThrow();
  });

  it('sem tiradas restantes, sempre marca', () => {
    const state = stateWithHand([1, 2, 4, 6, 6], { modeId: 'basic', drawsUsed: 3 });
    for (const npc of NPCS) {
      const action = npc.decideAction(state, 'npc', createSeededRng(3));
      expect(action.type).toBe('score');
    }
  });

  it('applyAction tranca as cartas pedidas e tira as outras', () => {
    const rng = createSeededRng(5);
    let state = draw(createGame({ modeId: 'full', players: [{ id: 'npc', name: 'N' }] }), rng);
    const kept = state.turn.hand[2];
    state = applyAction(state, { type: 'draw', locks: [false, false, true, false, false] }, rng);
    expect(state.turn.locked).toEqual([false, false, true, false, false]);
    expect(state.turn.hand[2]).toBe(kept);
    expect(state.turn.drawsUsed).toBe(2);
    expect(() => applyAction(state, { type: 'draw', locks: [true] }, rng)).toThrow();
  });
});

describe('comportamento', () => {
  const noRandom = () => 0.5; // ≥ 0.2: o Fácil nunca faz a escolha aleatória

  it('todos marcam Yar! com cinco iguais', () => {
    const state = stateWithHand([4, 4, 4, 4, 4]);
    expect(easyDecide(state, 'npc', noRandom)).toEqual({ type: 'score', category: 'yar' });
    expect(mediumDecide(state, 'npc', noRandom)).toEqual({ type: 'score', category: 'yar' });
    expect(getNpc('hard').decideAction(state, 'npc', createSeededRng(1))).toEqual({
      type: 'score',
      category: 'yar',
    });
  });

  it('Difícil e Médio marcam Corda quando já têm', () => {
    const state = stateWithHand([5, 3, 1, 4, 2]);
    expect(mediumDecide(state, 'npc', noRandom)).toEqual({ type: 'score', category: 'large_straight' });
    expect(getNpc('hard').decideAction(state, 'npc', createSeededRng(1))).toEqual({
      type: 'score',
      category: 'large_straight',
    });
  });

  it('quando nada pontua, Médio e Difícil zeram uma categoria barata, nunca a Corda', () => {
    const filled = Object.fromEntries(
      CATEGORY_IDS.filter((c) => !['ones', 'yar', 'large_straight'].includes(c)).map((c) => [c, 5]),
    );
    const state = stateWithHand([2, 2, 3, 3, 6], { drawsUsed: 4, filled });
    const medium = mediumDecide(state, 'npc', noRandom);
    const hard = getNpc('hard').decideAction(state, 'npc', createSeededRng(1));
    for (const action of [medium, hard]) {
      expect(action.type).toBe('score');
      expect(['ones', 'yar']).toContain(action.category);
    }
  });

  it('no começo da partida, Médio prefere zerar Fragmento Um a Yar! e evita gastar Kkakdugi', () => {
    const state = stateWithHand([2, 2, 3, 3, 6], { drawsUsed: 4 });
    const { gainOf } = categoryGains(state, 'npc');
    expect(gainOf('ones')).toBeGreaterThan(gainOf('yar'));
    expect(gainOf('chance')).toBeLessThan(0); // Kkakdugi com 16 pontos é desperdício
    expect(mediumDecide(state, 'npc', noRandom).category).not.toBe('yar');
    expect(mediumDecide(state, 'npc', noRandom).category).not.toBe('chance');
  });

  it('Fácil é guloso e tranca o valor que mais se repete', () => {
    const last = stateWithHand([6, 6, 6, 2, 2], { modeId: 'basic', drawsUsed: 3 });
    expect(easyDecide(last, 'npc', noRandom)).toEqual({ type: 'score', category: 'sixes' });
    const mid = stateWithHand([3, 5, 3, 1, 6], { modeId: 'basic' });
    expect(easyDecide(mid, 'npc', noRandom)).toEqual({
      type: 'draw',
      locks: [true, false, true, false, false],
    });
  });

  it('Fácil às vezes faz escolha aleatória (20%)', () => {
    const state = stateWithHand([6, 6, 6, 2, 2], { modeId: 'basic', drawsUsed: 3 });
    const rng = createSeededRng(9);
    const picks = new Set();
    for (let i = 0; i < 200; i++) picks.add(easyDecide(state, 'npc', rng).category);
    expect(picks.size).toBeGreaterThan(1);
  });

  it('Médio busca a sequência: com 1-2-3-4 tranca os 4 e tenta a Corda', () => {
    const state = stateWithHand([1, 2, 3, 4, 4]);
    expect(mediumDecide(state, 'npc', noRandom)).toEqual({
      type: 'draw',
      locks: [true, true, true, true, false],
    });
    const lastDraw = stateWithHand([1, 2, 3, 4, 4], { drawsUsed: 4 });
    expect(mediumDecide(lastDraw, 'npc', noRandom)).toEqual({ type: 'score', category: 'small_straight' });
  });

  it('Médio busca full house com dois pares', () => {
    const state = stateWithHand([2, 5, 2, 5, 1], {
      filled: { two_pair: 15, pair: 10, chance: 20 },
    });
    expect(mediumDecide(state, 'npc', noRandom)).toEqual({
      type: 'draw',
      locks: [true, true, true, true, false],
    });
  });

  it('Difícil respeita o baralho: sem 6 no baralho, não guarda os 6 para Yar!', () => {
    const hand = [6, 6, 6, 1, 2];
    const onlyLow = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5];
    const filled = Object.fromEntries(CATEGORY_IDS.filter((c) => c !== 'yar').map((c) => [c, 1]));
    const withSixes = stateWithHand(hand, { filled });
    const noSixes = stateWithHand(hand, { filled, deck: onlyLow });
    const a = getNpc('hard').decideAction(withSixes, 'npc', createSeededRng(1));
    const b = getNpc('hard').decideAction(noSixes, 'npc', createSeededRng(1));
    expect(a.type).toBe('draw');
    expect(a.locks.slice(0, 3)).toEqual([true, true, true]);
    expect(b.type === 'score' || !b.locks.slice(0, 3).every(Boolean)).toBe(true);
  });
});

describe('lookahead', () => {
  const dice = buildValueTables({ depth: 3 });
  const full = buildValueTables({ depth: 2, deckCounts: [6, 6, 6, 6, 6, 6] });

  it('V[0] é a pontuação do core', () => {
    for (const hand of [
      [1, 1, 1, 1, 1],
      [2, 3, 4, 5, 6],
      [3, 3, 3, 5, 5],
    ]) {
      const scores = scoreHand(hand);
      for (const id of CATEGORY_IDS) expect(handValue(dice, codeOfCards(hand), id, 0)).toBe(scores[id]);
    }
  });

  it('mais tiradas nunca diminuem o valor esperado', () => {
    for (const { V } of [dice, full]) {
      for (let r = 1; r < V.length; r++) {
        for (let i = 0; i < V[r].length; i++) expect(V[r][i]).toBeGreaterThanOrEqual(V[r - 1][i] - 1e-9);
      }
    }
  });

  it('modelo de dados: Yar! com 3 tiradas ≈ 2,30 e Kkakdugi ≈ 23,33 (valores conhecidos)', () => {
    expect(keepValue(dice, 0, 'yar', 2)).toBeCloseTo(2.3014, 3);
    expect(keepValue(dice, 0, 'chance', 2)).toBeCloseTo(23.333, 2);
  });

  it('respeita o baralho: probabilidade sem reposição', () => {
    // restam 2 seis em 32 cartas: completar a quadra de 6 vale 50 · 2/32
    const twoSixes = buildValueTables({ categoryIds: ['yar'], depth: 1, deckCounts: [6, 6, 6, 6, 6, 2] });
    expect(keepValue(twoSixes, codeOfCards([6, 6, 6, 6]), 'yar', 0)).toBeCloseTo(50 * (2 / 32), 9);
    // manter 6-6-6 e tirar 2 (última tirada): baralho cheio de 31 com 6 seis → 50 · C(6,2)/C(31,2)
    const sixesLeft = buildValueTables({ categoryIds: ['yar'], depth: 1, deckCounts: [5, 5, 5, 5, 5, 6] });
    expect(keepValue(sixesLeft, codeOfCards([6, 6, 6]), 'yar', 0)).toBeCloseTo(50 * (15 / 465), 9);
    // sem seis no baralho, isso vale 0
    const noSixes = buildValueTables({ categoryIds: ['yar'], depth: 1, deckCounts: [6, 6, 6, 6, 6, 0] });
    expect(keepValue(noSixes, codeOfCards([6, 6, 6]), 'yar', 0)).toBe(0);
  });
});

describe('expectedValues', () => {
  it('tem as 15 categorias para 3 e 4 tiradas, dentro dos limites', () => {
    for (const draws of [3, 4]) {
      for (const { id, min, max } of CATEGORIES) {
        const ev = EXPECTED_VALUES[draws][id];
        expect(ev).toBeGreaterThanOrEqual(min);
        expect(ev).toBeLessThanOrEqual(max);
      }
    }
  });

  it('4 tiradas valem pelo menos o mesmo que 3', () => {
    for (const id of CATEGORY_IDS) {
      expect(EXPECTED_VALUES[4][id]).toBeGreaterThanOrEqual(EXPECTED_VALUES[3][id] - 0.1);
    }
  });
});

describe('desempenho do Difícil', () => {
  it('cada decisão leva menos de 150 ms', () => {
    warmUp(); // a montagem única da estrutura não conta
    const hard = getNpc('hard');
    const rng = createSeededRng(11);
    let state = createGame({ modeId: 'full', players: [{ id: 'npc', name: 'N' }] });
    let worst = 0;
    for (let i = 0; i < 40 && !isGameOver(state); i++) {
      const t0 = performance.now();
      const action = hard.decideAction(state, 'npc', rng);
      worst = Math.max(worst, performance.now() - t0);
      state = applyAction(state, action, rng);
    }
    expect(worst).toBeLessThan(150);
  });
});
