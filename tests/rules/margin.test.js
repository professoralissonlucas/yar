/**
 * Folga até o limite do Firestore (1000 expressões avaliadas por gravação):
 * as mesmas gravações legítimas, com as regras recebendo FOLGA expressões a
 * mais (`true && true && …`) em todo create/update. Se alguma mudança nas
 * regras deixar uma jogada perto do limite, este teste quebra antes da
 * produção. (Foi esse limite que recusou a 2ª tirada depois da Fase 7.)
 */
import { assertSucceeds } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { draw, scoreTurn, toggleLock } from '../../src/core/game.js';
import { createSeededRng } from '../../src/core/rng.js';
import { fromGameDoc } from '../../src/online/roomState.js';
import {
  GUEST,
  HOST,
  Timestamp,
  clearDb,
  commit,
  forfeit,
  heartbeat,
  patchRoom,
  playWholeMatch,
  playingRoom,
  readRoom,
  setupEnv,
  teardownEnv,
  voteRematch,
} from './helpers.js';

// Cada `true` extra custa ~3,3 expressões, então 75 ≈ 250 expressões (¼ do
// limite). Medido no fim da correção (folga máxima, em `true`s): começar 101,
// recomeçar 113, marcação 140, tiradas 154–188, cadeado 213, demais 216–275.
// Para medir de novo: RULES_PADDING=<n> no ambiente.
const FOLGA = Number(process.env.RULES_PADDING ?? 75);

beforeAll(() => setupEnv({ padding: FOLGA }));
afterAll(teardownEnv);
beforeEach(clearDb);

describe(`folga de ${FOLGA} expressões em toda gravação`, () => {
  it('a sequência do bug (tirar, trancar, tirar, marcar)', async () => {
    const { code, game } = await playingRoom({ modeId: 'odd' });
    const rng = createSeededRng(7);
    let rev = 1;
    let s = draw(game, rng);
    rev = await assertSucceeds(commit(code, HOST, s, rev));
    s = toggleLock(toggleLock(s, 0), 3);
    rev = await assertSucceeds(commit(code, HOST, s, rev));
    s = draw(s, rng);
    rev = await assertSucceeds(commit(code, HOST, s, rev));
    s = draw(s, rng);
    rev = await assertSucceeds(commit(code, HOST, s, rev));
    await assertSucceeds(commit(code, HOST, scoreTurn(s, 'chance'), rev));
  });

  it('partida inteira no Completo (15 categorias, 4 tiradas) e revanche', async () => {
    const { code, game } = await playingRoom({ modeId: 'full' });
    await playWholeMatch(code, game, 1, { seed: 77, label: 'full+folga' });
    await assertSucceeds(voteRematch(code, GUEST));
    await assertSucceeds(voteRematch(code, HOST));
    const room = await readRoom(code);
    expect(room.status).toBe('playing');
    await playWholeMatch(code, fromGameDoc(room.game), room.rev, { seed: 78, label: 'revanche+folga' });
  });

  it('sinal de vida e abandono', async () => {
    const { code } = await playingRoom({ modeId: 'full' });
    await assertSucceeds(heartbeat(code, GUEST));
    await patchRoom(code, { [`presence.${GUEST}`]: Timestamp.fromMillis(Date.now() - 3 * 60 * 1000) });
    await assertSucceeds(forfeit(code, HOST));
  });
});
