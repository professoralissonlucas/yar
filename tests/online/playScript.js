/**
 * Roteiro de partida "como a mesa joga", usado pelos testes das regras (o
 * espelho em JS em tests/online/rules.test.js e o emulador em tests/rules/).
 */
import { canDraw, chooseTimeoutCategory, draw, getEmptyCategories, scoreTurn, toggleLock } from '../../src/core/game.js';
import { createSeededRng } from '../../src/core/rng.js';

/**
 * Joga uma partida como a mesa faz, devolvendo cada estado que a mesa manda
 * gravar (onLocalChange), na ordem: tirada, cadeados, tirada…, marcação. Às
 * vezes o tempo acaba (sem tirar: tirada e marcação em dois passos).
 */
export function playLikeTheTable(start, seed) {
  const rng = createSeededRng(seed);
  const pick = (n) => Math.floor(rng() * n);
  const pushed = [];
  let s = start;
  while (s.status === 'playing') {
    const timeoutBeforeDrawing = pick(10) === 0;
    if (timeoutBeforeDrawing) {
      s = draw(s, rng);
      pushed.push(s);
      s = scoreTurn(s, chooseTimeoutCategory(s));
      pushed.push(s);
      continue;
    }
    s = draw(s, rng);
    pushed.push(s);
    while (canDraw(s) && pick(3) > 0) {
      for (let k = pick(4); k > 0; k--) {
        s = toggleLock(s, pick(5)); // às vezes tranca e destranca a mesma (volta ao gravado)
        pushed.push(s);
      }
      if (!canDraw(s)) break;
      s = draw(s, rng);
      pushed.push(s);
    }
    const empty = getEmptyCategories(s);
    s = pick(5) === 0 ? scoreTurn(s, chooseTimeoutCategory(s)) : scoreTurn(s, empty[pick(empty.length)]);
    pushed.push(s);
  }
  return pushed;
}
