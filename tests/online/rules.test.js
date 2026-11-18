import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGame, draw, scoreTurn, toggleLock } from '../../src/core/game.js';
import { MODES } from '../../src/core/modes.js';
import { createSeededRng } from '../../src/core/rng.js';
import { CATEGORIES } from '../../src/core/scoring.js';
import { plannedWrites, sameStep } from '../../src/online/pushQueue.js';
import { newRoomDoc, rematchGame, startingGame, toGameDoc } from '../../src/online/roomState.js';
import { playLikeTheTable } from './playScript.js';
import { gameShapeOk, newGameOk, validMove } from './rulesMirror.js';

const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const roundTrip = (v) => JSON.parse(JSON.stringify(v));

function roomFor(modeId) {
  return {
    ...newRoomDoc({ uid: 'host', name: 'Ana', modeId, timerEnabled: false, now: 0, expireAt: 0 }),
    guestUid: 'guest',
    players: { host: { name: 'Ana' }, guest: { name: 'Bia' } },
  };
}

/** Trecho do .rules entre dois marcadores. */
const between = (start, end) => RULES.slice(RULES.indexOf(start), RULES.indexOf(end, RULES.indexOf(start)));
const parseList = (text) => [...text.matchAll(/'([a-zA-Z_]+)'/g)].map((m) => m[1]);

describe('firestore.rules: tabelas iguais às do core', () => {
  it('modos (tiradas e categorias, na ordem)', () => {
    const body = between('function modes()', 'function catRange()');
    const parsed = Object.fromEntries(
      [...body.matchAll(/'(\w+)': \{ 'draws': (\d), 'cats': \[([^\]]*)\] \}/g)].map((m) => [
        m[1],
        { draws: Number(m[2]), cats: parseList(m[3]) },
      ]),
    );
    expect(parsed).toEqual(Object.fromEntries(MODES.map((m) => [m.id, { draws: m.maxDraws, cats: m.categories }])));
  });

  it('faixa de pontos de cada categoria', () => {
    const body = between('function catRange()', 'function roomKeys()');
    const parsed = Object.fromEntries(
      [...body.matchAll(/'(\w+)': \[(\d+), (\d+)\]/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])]]),
    );
    expect(parsed).toEqual(Object.fromEntries(CATEGORIES.map((c) => [c.id, [c.min, c.max]])));
  });

  it('campos da sala e do game iguais aos que o cliente grava', () => {
    expect(parseList(between('function roomKeys()', 'function gameKeys()')).sort()).toEqual(
      Object.keys(roomFor('basic')).sort(),
    );
    expect(parseList(between('function gameKeys()', 'function turnKeys()')).sort()).toEqual(
      Object.keys(toGameDoc(createGame({ modeId: 'basic', players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }))).sort(),
    );
  });
});

/** O que a fila grava: sem juntar nada, ou juntando ao máximo (mesma lógica da fila). */
function committed(pushed, merge) {
  return merge ? plannedWrites(pushed, sameStep) : pushed;
}

describe('o cliente só grava jogadas que as regras aceitam', () => {
  for (const mode of MODES) {
    for (const merge of [false, true]) {
      it(`${mode.id}: partidas inteiras ${merge ? 'com' : 'sem'} cliques de cadeado juntados`, () => {
        for (let seed = 1; seed <= 15; seed++) {
          const room = roomFor(mode.id);
          const start = startingGame(room, createSeededRng(seed));
          let prev = roundTrip(toGameDoc(start));
          expect(newGameOk(prev, room)).toBe(true);
          for (const state of committed(playLikeTheTable(start, seed * 7), merge)) {
            const next = roundTrip(toGameDoc(state));
            if (!validMove(prev, next)) {
              throw new Error(`jogada recusada (${mode.id}, seed ${seed}):\n${JSON.stringify({ prev, next })}`);
            }
            prev = next;
          }
          expect(prev.status).toBe('finished');
          // revanche: jogo novo também válido
          expect(newGameOk(roundTrip(toGameDoc(rematchGame({ ...room, game: prev }))), room)).toBe(true);
        }
      });
    }
  }
});

describe('trapaças recusadas', () => {
  const room = roomFor('full');
  const rng = createSeededRng(42);
  const start = startingGame(room, () => 0); // anfitrião começa
  const drawn = draw(start, rng);
  const doc = (s) => roundTrip(toGameDoc(s));
  const S0 = doc(start);
  const S1 = doc(drawn);
  const scored = doc(scoreTurn(drawn, 'chance'));

  const mutate = (base, fn) => {
    const copy = roundTrip(base);
    fn(copy);
    return copy;
  };

  it('jogadas honestas passam (controle)', () => {
    expect(validMove(S0, S1)).toBe(true);
    expect(validMove(S1, doc(toggleLock(drawn, 2)))).toBe(true);
    expect(validMove(S1, scored)).toBe(true);
  });

  it('marcar fora da faixa da categoria', () => {
    expect(validMove(S1, mutate(scored, (g) => {
      g.scores.host.chance = 31;
      g.lastScored.points = 31;
    }))).toBe(false);
    expect(validMove(S1, mutate(scored, (g) => {
      g.scores.host.chance = 2; // Chance vale no mínimo 5
      g.lastScored.points = 2;
    }))).toBe(false);
  });

  it('valor gravado diferente de lastScored.points, ou ponto não inteiro', () => {
    expect(validMove(S1, mutate(scored, (g) => (g.scores.host.chance = 29)))).toBe(false);
    expect(validMove(S1, mutate(scored, (g) => {
      g.scores.host.chance = 10.5;
      g.lastScored.points = 10.5;
    }))).toBe(false);
  });

  it('preencher duas categorias de uma vez', () => {
    expect(validMove(S1, mutate(scored, (g) => (g.scores.host.yar = 50)))).toBe(false);
  });

  it('mexer no placar do outro ou numa categoria já marcada', () => {
    expect(validMove(S1, mutate(scored, (g) => (g.scores.guest.ones = 5)))).toBe(false);
    const later = mutate(S1, (g) => (g.scores.host.chance = 20));
    const overwrite = mutate(scored, (g) => (g.scores.host.chance = 25));
    overwrite.lastScored.points = 25;
    expect(validMove(later, overwrite)).toBe(false);
  });

  it('marcar sem ter tirado as cartas', () => {
    const noDraw = mutate(scored, () => {});
    expect(validMove(S0, noDraw)).toBe(false);
  });

  it('tirar duas vezes de uma vez ou além do limite', () => {
    const twice = mutate(S1, (g) => (g.turn.drawsUsed = 3));
    expect(validMove(S1, twice)).toBe(false);
    const atLimit = mutate(S1, (g) => (g.turn.drawsUsed = 4));
    const beyond = mutate(atLimit, (g) => (g.turn.drawsUsed = 5));
    expect(validMove(atLimit, beyond)).toBe(false);
  });

  it('trocar uma carta trancada, ou mudar a mão sem tirar', () => {
    const locked = doc(toggleLock(drawn, 0));
    const redrawn = doc(draw(toggleLock(drawn, 0), rng));
    expect(validMove(locked, redrawn)).toBe(true);
    expect(validMove(locked, mutate(redrawn, (g) => (g.turn.hand[0] = g.turn.hand[0] === 6 ? 5 : 6)))).toBe(false);
    expect(validMove(S1, mutate(S1, (g) => (g.turn.hand = [6, 6, 6, 6, 6])))).toBe(false);
  });

  it('mão ou cadeados com forma errada', () => {
    const next = doc(draw(drawn, rng));
    expect(validMove(S1, mutate(next, (g) => (g.turn.hand = [...g.turn.hand, 6])))).toBe(false);
    expect(validMove(S1, mutate(next, (g) => (g.turn.hand[1] = 7)))).toBe(false);
    expect(validMove(S1, mutate(next, (g) => (g.turn.locked[2] = 'sim')))).toBe(false);
    expect(validMove(S1, mutate(next, (g) => g.turn.deck.pop()))).toBe(false);
  });

  it('mudar campos fixos ou acrescentar campos', () => {
    expect(validMove(S1, mutate(S1, (g) => (g.maxDraws = 9)))).toBe(false);
    expect(validMove(S1, mutate(S1, (g) => (g.players[1].name = 'Outro')))).toBe(false);
    expect(validMove(S1, mutate(S1, (g) => (g.categories = ['yar'])))).toBe(false);
    expect(validMove(S1, mutate(S1, (g) => (g.extra = 1)))).toBe(false);
    expect(gameShapeOk(mutate(S1, (g) => (g.turn.bonus = 1)))).toBe(false);
  });

  it('marcar e continuar jogando (não passar a vez)', () => {
    expect(validMove(S1, mutate(scored, (g) => {
      g.currentPlayerIndex = 0;
      g.currentUid = 'host';
    }))).toBe(false);
  });

  it('jogo novo com categorias marcadas, jogador estranho ou modo trocado', () => {
    expect(newGameOk(mutate(S0, (g) => (g.scores.host.yar = 50)), room)).toBe(false);
    expect(newGameOk(mutate(S0, (g) => (g.players[1] = { id: 'intruso', name: 'X' })), room)).toBe(false);
    expect(newGameOk(S0, { ...room, mode: 'basic' })).toBe(false);
  });
});
