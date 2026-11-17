/**
 * NPCs. Todos expõem decideAction(state, playerId, rng), que devolve
 * { type: 'draw', locks: [5 booleanos] } ou { type: 'score', category }.
 */

import { draw, scoreTurn, toggleLock } from '../core/game.js';
import * as easy from './easy.js';
import * as hard from './hard.js';
import * as medium from './medium.js';

export const NPCS = [
  { id: 'easy', label: 'Fácil', name: 'Igor', decideAction: easy.decideAction },
  { id: 'medium', label: 'Médio', name: 'Eileen', decideAction: medium.decideAction },
  { id: 'hard', label: 'Difícil', name: 'Islin', decideAction: hard.decideAction },
];

export function getNpc(id) {
  const npc = NPCS.find((n) => n.id === id);
  if (!npc) throw new Error(`NPC desconhecido: ${id}`);
  return npc;
}

/** Aplica uma ação de NPC ao estado usando só as funções do core. */
export function applyAction(state, action, rng) {
  if (action.type === 'score') return scoreTurn(state, action.category);
  if (action.type !== 'draw') throw new Error(`Ação desconhecida: ${action.type}`);

  const { locks } = action;
  if (!Array.isArray(locks) || locks.length !== state.turn.locked.length) {
    throw new Error('A ação de tirar precisa de 5 travas');
  }
  let next = state;
  if (state.turn.drawsUsed === 0) {
    if (locks.some(Boolean)) throw new Error('Não dá para trancar antes da 1ª tirada');
  } else {
    locks.forEach((locked, i) => {
      if (next.turn.locked[i] !== locked) next = toggleLock(next, i);
    });
  }
  return draw(next, rng);
}
