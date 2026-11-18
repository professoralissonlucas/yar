/**
 * O que mudou entre o estado que a mesa mostra e o estado novo vindo do
 * adversário (online)? Função pura, para a mesa animar só o necessário.
 *
 * - { type: 'none' }: nada mudou;
 * - { type: 'update', dealt, locks }: mesmo turno; `dealt` = posições de
 *   cartas novas (tirada), `locks` = posições cujo cadeado mudou;
 * - { type: 'scored' }: o jogador da vez marcou uma categoria (fim do turno);
 * - { type: 'reset' }: qualquer outra coisa (redesenha tudo).
 */
import { HAND_SIZE } from '../core/deck.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const indices = () => [...Array(HAND_SIZE).keys()];

function filledCount(state) {
  return Object.values(state.scores).reduce(
    (sum, playerScores) => sum + Object.values(playerScores).filter((v) => v !== null).length,
    0,
  );
}

export function describeRemoteChange(prev, next) {
  if (same(prev, next)) return { type: 'none' };
  if (prev.modeId !== next.modeId || !same(prev.players, next.players)) return { type: 'reset' };

  if (!same(prev.scores, next.scores) || prev.status !== next.status) {
    const last = next.lastScored;
    const scorer = prev.players[prev.currentPlayerIndex].id;
    const oneMore = filledCount(next) - filledCount(prev) === 1;
    if (oneMore && last && last.playerId === scorer && next.scores[scorer][last.categoryId] === last.points) {
      return { type: 'scored' };
    }
    return { type: 'reset' };
  }

  if (prev.currentPlayerIndex !== next.currentPlayerIndex || prev.round !== next.round) return { type: 'reset' };

  const before = prev.turn;
  const after = next.turn;
  if (after.drawsUsed < before.drawsUsed) return { type: 'reset' };

  const locks = indices().filter((i) => before.locked[i] !== after.locked[i]);
  if (after.drawsUsed === before.drawsUsed) {
    if (!same(before.hand, after.hand)) return { type: 'reset' };
    return { type: 'update', dealt: [], locks };
  }
  // tirou: na 1ª tirada chegam as 5; depois, as que não estão trancadas
  if (before.drawsUsed === 0) return { type: 'update', dealt: indices(), locks: [] };
  return { type: 'update', dealt: indices().filter((i) => !after.locked[i]), locks };
}
