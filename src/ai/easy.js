/**
 * Fácil (Prof. Alishow — Bonzinho). Tranca o valor que mais se repete, para quando tem algo bom
 * por acaso e marca a categoria que dá mais pontos agora (guloso).
 * 20% de chance de fazer uma escolha aleatória.
 */

import { HAND_SIZE } from '../core/deck.js';
import { getEmptyCategories, getScoreOptions } from '../core/game.js';
import { getCategory } from '../core/scoring.js';
import {
  argmax,
  assertNpcTurn,
  countValues,
  drawAction,
  drawsLeft,
  locksForValues,
  scoreAction,
} from './common.js';

export const RANDOM_CHOICE_CHANCE = 0.2;
const GOOD_ENOUGH_RATIO = 0.8;

export function decideAction(state, playerId, rng) {
  assertNpcTurn(state, playerId);
  if (state.turn.drawsUsed === 0) return drawAction();

  const empty = getEmptyCategories(state, playerId);
  const options = getScoreOptions(state);
  const randomPick = rng() < RANDOM_CHOICE_CHANCE;

  const chooseCategory = () =>
    randomPick
      ? empty[Math.floor(rng() * empty.length)]
      : argmax(empty, (c) => options[c]).category;

  if (drawsLeft(state) === 0) return scoreAction(chooseCategory());

  const hasSomethingGood = empty.some(
    (c) => options[c] > 0 && options[c] >= GOOD_ENOUGH_RATIO * getCategory(c).max,
  );
  if (hasSomethingGood) return scoreAction(chooseCategory());

  let locks;
  if (randomPick) {
    locks = Array.from({ length: HAND_SIZE }, () => rng() < 0.5);
  } else {
    const counts = countValues(state.turn.hand);
    let bestValue = 6;
    for (let v = 6; v >= 1; v--) if (counts[v] > counts[bestValue]) bestValue = v;
    locks = locksForValues(state.turn.hand, [bestValue]);
  }

  if (locks.every(Boolean)) return scoreAction(chooseCategory());
  return drawAction(locks);
}
