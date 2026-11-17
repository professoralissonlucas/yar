import { describe, expect, it } from 'vitest';
import {
  applyTimeout,
  canDraw,
  canScore,
  chooseTimeoutCategory,
  createGame,
  draw,
  getCurrentPlayer,
  getEmptyCategories,
  getScoreOptions,
  getTotals,
  getWinners,
  isGameOver,
  scoreTurn,
  toggleLock,
} from '../src/core/game.js';
import { getMode } from '../src/core/modes.js';
import { createSeededRng } from '../src/core/rng.js';

const PLAYERS = [
  { id: 'ana', name: 'Ana' },
  { id: 'bia', name: 'Bia' },
];

/** rng que não embaralha: o baralho fica 1,1,1,1,1,1,2,2,… */
const sortedRng = () => 0.999999;

/** Congela o objeto inteiro: qualquer mutação lança erro (módulos ES são strict). */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

function newGame(modeId = 'basic', players = PLAYERS) {
  return deepFreeze(createGame({ modeId, players }));
}

/** Coloca uma mão específica no turno atual (como se já tivesse tirado). */
function withHand(state, hand, drawsUsed = 1) {
  return deepFreeze({
    ...state,
    turn: { deck: [], hand, locked: [false, false, false, false, false], drawsUsed },
  });
}

function withScores(state, playerId, partial) {
  return deepFreeze({
    ...state,
    scores: { ...state.scores, [playerId]: { ...state.scores[playerId], ...partial } },
  });
}

describe('createGame', () => {
  it('cria o estado inicial a partir do modo', () => {
    const g = newGame('sequence');
    expect(g.modeId).toBe('sequence');
    expect(g.maxDraws).toBe(4);
    expect(g.categories).toEqual(getMode('sequence').categories);
    expect(g.status).toBe('playing');
    expect(g.currentPlayerIndex).toBe(0);
    expect(g.round).toBe(0);
    expect(g.turn).toEqual({
      deck: [],
      hand: [],
      locked: [false, false, false, false, false],
      drawsUsed: 0,
    });
    expect(g.scores.ana).toEqual(Object.fromEntries(g.categories.map((c) => [c, null])));
    expect(g.scores.bia.small_straight).toBeNull();
    expect(getCurrentPlayer(g)).toEqual({ id: 'ana', name: 'Ana' });
  });

  it('valida modo e jogadores', () => {
    expect(() => createGame({ modeId: 'xyz', players: PLAYERS })).toThrow();
    expect(() => createGame({ modeId: 'basic', players: [] })).toThrow();
    expect(() =>
      createGame({ modeId: 'basic', players: [{ id: 'a' }, { id: 'a' }] }),
    ).toThrow();
  });
});

describe('draw / toggleLock', () => {
  it('1ª tirada: baralho novo de 36, 5 cartas na mão, 31 restantes', () => {
    const g = deepFreeze(draw(newGame(), createSeededRng(1)));
    expect(g.turn.drawsUsed).toBe(1);
    expect(g.turn.hand).toHaveLength(5);
    expect(g.turn.deck).toHaveLength(31);
    expect(g.turn.locked).toEqual([false, false, false, false, false]);
  });

  it('troca só as cartas não trancadas, usando o restante do baralho', () => {
    let g = draw(newGame(), sortedRng);
    expect(g.turn.hand).toEqual([1, 1, 1, 1, 1]);
    g = deepFreeze(toggleLock(g, 0));
    g = deepFreeze(toggleLock(g, 3));
    expect(g.turn.locked).toEqual([true, false, false, true, false]);

    g = deepFreeze(draw(g, sortedRng));
    // restante era [1, 2,2,2,2,2,2, 3…]; trocadas as posições 1, 2 e 4
    expect(g.turn.hand).toEqual([1, 1, 2, 1, 2]);
    expect(g.turn.deck).toHaveLength(28);
    expect(g.turn.locked).toEqual([true, false, false, true, false]);
    expect(g.turn.drawsUsed).toBe(2);
  });

  it('cartas descartadas não voltam ao baralho durante o turno', () => {
    let g = newGame('full');
    const seen = [];
    g = draw(g, createSeededRng(99));
    seen.push(...g.turn.hand);
    for (let i = 1; i < g.maxDraws; i++) {
      g = draw(g, createSeededRng(99));
      seen.push(...g.turn.hand); // nada trancado: as 5 são novas
    }
    expect(seen).toHaveLength(20);
    expect(g.turn.deck).toHaveLength(16);
    const all = [...seen, ...g.turn.deck];
    for (let v = 1; v <= 6; v++) expect(all.filter((c) => c === v)).toHaveLength(6);
  });

  it('respeita o limite de 3 tiradas no modo básico', () => {
    let g = newGame('basic');
    for (let i = 0; i < 3; i++) {
      expect(canDraw(g)).toBe(true);
      g = draw(g, createSeededRng(i));
    }
    expect(g.turn.drawsUsed).toBe(3);
    expect(canDraw(g)).toBe(false);
    expect(() => draw(g, createSeededRng(5))).toThrow(/Limite/);
  });

  it('respeita o limite de 4 tiradas no modo completo', () => {
    let g = newGame('full');
    for (let i = 0; i < 4; i++) g = draw(g, createSeededRng(i));
    expect(g.turn.drawsUsed).toBe(4);
    expect(() => draw(g, createSeededRng(5))).toThrow();
  });

  it('não tira com todas as cartas trancadas', () => {
    let g = draw(newGame(), sortedRng);
    for (let i = 0; i < 5; i++) g = toggleLock(g, i);
    expect(canDraw(g)).toBe(false);
    expect(() => draw(g, sortedRng)).toThrow(/trancadas/);
  });

  it('toggleLock alterna e valida', () => {
    const g0 = newGame();
    expect(() => toggleLock(g0, 0)).toThrow();
    const g = deepFreeze(draw(g0, sortedRng));
    expect(toggleLock(toggleLock(g, 2), 2).turn.locked).toEqual(g.turn.locked);
    expect(() => toggleLock(g, 5)).toThrow();
    expect(() => toggleLock(g, -1)).toThrow();
  });
});

describe('scoreTurn', () => {
  it('marca os pontos, passa a vez e reseta o turno', () => {
    const g = withHand(newGame(), [6, 6, 6, 2, 2]);
    expect(getScoreOptions(g)).toEqual({
      ones: 0,
      twos: 4,
      threes: 0,
      fours: 0,
      fives: 0,
      sixes: 18,
    });
    const next = deepFreeze(scoreTurn(g, 'sixes'));
    expect(next.scores.ana.sixes).toBe(18);
    expect(next.lastScored).toEqual({ playerId: 'ana', categoryId: 'sixes', points: 18 });
    expect(getCurrentPlayer(next).id).toBe('bia');
    expect(next.round).toBe(0);
    expect(next.turn.drawsUsed).toBe(0);
    expect(next.turn.hand).toEqual([]);
    expect(getEmptyCategories(next, 'ana')).not.toContain('sixes');
    expect(getEmptyCategories(next)).toHaveLength(6); // vez da Bia
  });

  it('permite zerar uma categoria (marcar com 0 pontos)', () => {
    const g = withHand(newGame(), [2, 3, 4, 5, 6]);
    const next = scoreTurn(g, 'ones');
    expect(next.scores.ana.ones).toBe(0);
  });

  it('pode marcar depois de qualquer tirada, inclusive a 1ª', () => {
    const g = draw(newGame(), createSeededRng(3));
    expect(canScore(g, 'ones')).toBe(true);
    expect(() => scoreTurn(g, 'ones')).not.toThrow();
  });

  it('não marca antes de tirar', () => {
    const g = newGame();
    expect(canScore(g, 'ones')).toBe(false);
    expect(getScoreOptions(g)).toEqual({});
    expect(() => scoreTurn(g, 'ones')).toThrow(/Tire/);
  });

  it('não marca categoria já usada', () => {
    const g = withHand(withScores(newGame(), 'ana', { twos: 4 }), [2, 2, 2, 2, 2]);
    expect(canScore(g, 'twos')).toBe(false);
    expect(() => scoreTurn(g, 'twos')).toThrow(/já foi marcada/);
    expect(getScoreOptions(g)).not.toHaveProperty('twos');
  });

  it('não marca categoria fora do modo', () => {
    const g = withHand(newGame('basic'), [6, 6, 6, 6, 6]);
    expect(canScore(g, 'yar')).toBe(false);
    expect(() => scoreTurn(g, 'yar')).toThrow(/modo/);
  });

  it('alterna os jogadores e avança a rodada', () => {
    let g = newGame();
    g = scoreTurn(withHand(g, [1, 1, 1, 1, 1]), 'ones'); // Ana
    expect(getCurrentPlayer(g).id).toBe('bia');
    g = scoreTurn(withHand(g, [1, 1, 1, 1, 1]), 'ones'); // Bia
    expect(getCurrentPlayer(g).id).toBe('ana');
    expect(g.round).toBe(1);
  });
});

describe('fim de jogo e vencedor', () => {
  /** Joga a partida inteira; handFor(playerId) define a mão de cada turno. */
  function playWholeGame(modeId, handFor) {
    let g = newGame(modeId);
    let turns = 0;
    while (!isGameOver(g)) {
      const player = getCurrentPlayer(g);
      const [firstEmpty] = getEmptyCategories(g);
      g = deepFreeze(scoreTurn(withHand(g, handFor(player.id)), firstEmpty));
      turns++;
    }
    return { g, turns };
  }

  it('termina quando todos preenchem todas as categorias (turnos = categorias do modo)', () => {
    const { g, turns } = playWholeGame('basic', () => [6, 6, 6, 6, 6]);
    expect(turns).toBe(12); // 6 categorias × 2 jogadores
    expect(g.status).toBe('finished');
    expect(() => draw(g, sortedRng)).toThrow(/terminou/);
    expect(() => scoreTurn(g, 'ones')).toThrow(/terminou/);
  });

  it('vence quem somar mais pontos', () => {
    const { g } = playWholeGame('basic', (id) => (id === 'ana' ? [6, 6, 6, 6, 6] : [1, 1, 1, 1, 1]));
    expect(getTotals(g)).toEqual({ ana: 30, bia: 5 });
    expect(getWinners(g)).toEqual({ winnerIds: ['ana'], isTie: false, totals: { ana: 30, bia: 5 } });
  });

  it('empate é possível', () => {
    const { g } = playWholeGame('odd', () => [3, 3, 3, 5, 5]);
    const { winnerIds, isTie } = getWinners(g);
    expect(isTie).toBe(true);
    expect(winnerIds).toEqual(['ana', 'bia']);
  });

  it('getTotals ignora categorias vazias; getWinners exige partida finalizada', () => {
    const g = withScores(newGame(), 'ana', { ones: 3, sixes: 24 });
    expect(getTotals(g)).toEqual({ ana: 27, bia: 0 });
    expect(() => getWinners(g)).toThrow();
  });

  it('partida completa com seed aleatória termina com placar consistente', () => {
    const rng = createSeededRng(2024);
    let g = newGame('full');
    while (!isGameOver(g)) {
      g = draw(g, rng);
      if (canDraw(g)) g = draw(toggleLock(g, 0), rng);
      g = deepFreeze(scoreTurn(g, chooseTimeoutCategory(g)));
    }
    for (const p of PLAYERS) {
      expect(getEmptyCategories(g, p.id)).toEqual([]);
    }
    const totals = getTotals(g);
    const sum = (id) => Object.values(g.scores[id]).reduce((a, b) => a + b, 0);
    expect(totals).toEqual({ ana: sum('ana'), bia: sum('bia') });
  });
});

describe('timeout', () => {
  it('marca a categoria vazia de maior pontuação', () => {
    const g = withHand(newGame(), [6, 6, 6, 2, 2]);
    expect(chooseTimeoutCategory(g)).toBe('sixes');
    expect(applyTimeout(g, sortedRng).scores.ana.sixes).toBe(18);
  });

  it('em empate de pontos, escolhe a de menor potencial', () => {
    // ones 1, twos 4, fours 4 (sixes já marcada) → empate twos/fours → twos
    const tie = withScores(newGame(), 'ana', { sixes: 0 });
    expect(chooseTimeoutCategory(withHand(tie, [2, 2, 4, 1, 6]))).toBe('twos');
    expect(chooseTimeoutCategory(withHand(tie, [4, 2, 2, 1, 6]))).toBe('twos');
  });

  it('se todas dariam 0, zera a de menor potencial', () => {
    let g = withScores(newGame('full'), 'ana', {
      twos: 4,
      threes: 6,
      fours: 8,
      fives: 10,
      sixes: 12,
      pair: 4,
      three_kind: 6,
      four_kind: 8,
      two_pair: 15,
      full_house: 25,
      small_straight: 30,
      chance: 20,
    });
    // vazias: ones, yar, large_straight — com 2,2,3,3,6 todas dão 0
    g = withHand(g, [2, 2, 3, 3, 6]);
    expect(chooseTimeoutCategory(g)).toBe('ones');
    expect(applyTimeout(g, sortedRng).scores.ana.ones).toBe(0);

    const g2 = withHand(withScores(g, 'ana', { ones: 0 }), [2, 2, 3, 3, 6]);
    expect(chooseTimeoutCategory(g2)).toBe('yar');
  });

  it('se ainda não tirou, tira automaticamente e marca', () => {
    const g = newGame();
    const next = applyTimeout(g, sortedRng); // mão 1,1,1,1,1
    expect(next.scores.ana.ones).toBe(5);
    expect(next.lastScored).toEqual({ playerId: 'ana', categoryId: 'ones', points: 5 });
    expect(getCurrentPlayer(next).id).toBe('bia');
  });
});

describe('imutabilidade', () => {
  it('nenhuma função altera o estado recebido', () => {
    const g0 = newGame('full');
    const snapshot = JSON.stringify(g0);
    const g1 = draw(g0, createSeededRng(1));
    const g2 = toggleLock(g1, 1);
    const g3 = draw(g2, createSeededRng(2));
    scoreTurn(g3, 'chance');
    applyTimeout(g3, createSeededRng(3));
    expect(JSON.stringify(g0)).toBe(snapshot);
    expect(g1).not.toBe(g0);
    expect(g2.turn.locked).not.toBe(g1.turn.locked);
  });
});
