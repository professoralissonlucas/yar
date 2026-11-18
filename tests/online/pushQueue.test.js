import { describe, expect, it, vi } from 'vitest';
import { createPushQueue } from '../../src/online/pushQueue.js';

class Conflict extends Error {}

/** commit controlável: cada chamada fica pendente até `resolveNext`/`rejectNext`. */
function controlledCommit() {
  const calls = [];
  const commit = vi.fn(
    (state, expectedRev) =>
      new Promise((resolve, reject) => {
        calls.push({ state, expectedRev, resolve, reject });
      }),
  );
  return { commit, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const noWait = () => Promise.resolve();

describe('createPushQueue', () => {
  it('grava em série, conferindo o rev, e marca os revs próprios', async () => {
    const { commit, calls } = controlledCommit();
    const queue = createPushQueue({ commit, initialRev: 4, wait: noWait });

    queue.push('a');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({ state: 'a', expectedRev: 4 });
    expect(queue.isOwnRev(5)).toBe(true);
    expect(queue.busy).toBe(true);

    calls[0].resolve(5);
    await queue.idle();
    expect(queue.rev).toBe(5);
    expect(queue.busy).toBe(false);

    queue.push('b');
    expect(calls[1]).toMatchObject({ state: 'b', expectedRev: 5 });
    calls[1].resolve(6);
    await queue.idle();
    expect(queue.rev).toBe(6);
    expect(queue.isOwnRev(6)).toBe(true);
  });

  it('cliques rápidos viram uma gravação só com o estado mais novo', async () => {
    const { commit, calls } = controlledCommit();
    const queue = createPushQueue({ commit, initialRev: 0, wait: noWait });

    queue.push('lock-1');
    queue.push('lock-2');
    queue.push('lock-3');
    queue.push('lock-4');
    expect(commit).toHaveBeenCalledTimes(1); // a 1ª já estava saindo

    calls[0].resolve(1);
    await flush();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(calls[1]).toMatchObject({ state: 'lock-4', expectedRev: 1 });
    calls[1].resolve(2);
    await queue.idle();
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('conflito de rev: descarta o que tinha e avisa', async () => {
    const { commit, calls } = controlledCommit();
    const onConflict = vi.fn();
    const queue = createPushQueue({
      commit,
      initialRev: 3,
      wait: noWait,
      classify: (e) => (e instanceof Conflict ? 'conflict' : 'retry'),
      onConflict,
    });

    queue.push('a');
    queue.push('b'); // na fila
    const error = new Conflict();
    calls[0].reject(error);
    await queue.idle();

    expect(onConflict).toHaveBeenCalledWith(error);
    expect(commit).toHaveBeenCalledTimes(1); // 'b' foi descartado
    expect(queue.isOwnRev(4)).toBe(false);
    queue.reset(7);
    expect(queue.rev).toBe(7);
  });

  it('erro de rede: tenta de novo e depois grava o que chegou nesse meio-tempo', async () => {
    const { commit, calls } = controlledCommit();
    const onRetry = vi.fn();
    const onSaved = vi.fn();
    const queue = createPushQueue({ commit, initialRev: 0, wait: noWait, onRetry, onSaved });

    queue.push('a');
    calls[0].reject(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await flush();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(calls[1]).toMatchObject({ state: 'a', expectedRev: 0 });

    queue.push('b');
    calls[1].reject(new Error('offline'));
    await flush();
    // 'a' é um passo próprio (não é só ajuste): é refeito antes de 'b'
    expect(calls[2]).toMatchObject({ state: 'a', expectedRev: 0 });
    calls[2].resolve(1);
    await flush();
    expect(calls[3]).toMatchObject({ state: 'b', expectedRev: 1 });
    calls[3].resolve(2);
    await queue.idle();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(queue.rev).toBe(2);
  });

  it('erro fatal (regras recusaram) para e avisa', async () => {
    const { commit, calls } = controlledCommit();
    const onFatal = vi.fn();
    const queue = createPushQueue({ commit, initialRev: 0, wait: noWait, classify: () => 'fatal', onFatal });
    queue.push('a');
    calls[0].reject(new Error('denied'));
    await queue.idle();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('observe acompanha o rev do outro jogador, mas não no meio de uma gravação', async () => {
    const { commit, calls } = controlledCommit();
    const queue = createPushQueue({ commit, initialRev: 2, wait: noWait });
    queue.observe(5);
    expect(queue.rev).toBe(5);
    queue.observe(4); // antigo
    expect(queue.rev).toBe(5);

    queue.push('a');
    queue.observe(9);
    expect(queue.rev).toBe(5);
    calls[0].resolve(6);
    await queue.idle();
    expect(queue.rev).toBe(6);
  });

  it('close: não aceita jogadas novas, mas termina a atual; stop: desiste', async () => {
    const { commit, calls } = controlledCommit();
    const queue = createPushQueue({ commit, initialRev: 0, wait: noWait });
    queue.push('final');
    queue.close();
    queue.push('depois');
    calls[0].resolve(1);
    await queue.idle();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(queue.rev).toBe(1);

    const second = controlledCommit();
    const onFatal = vi.fn();
    const stopped = createPushQueue({ commit: second.commit, initialRev: 0, wait: noWait, onFatal });
    stopped.push('a');
    stopped.stop();
    second.calls[0].reject(new Error('offline'));
    await stopped.idle();
    expect(second.commit).toHaveBeenCalledTimes(1); // não tenta de novo
  });

  it('fechada, desiste depois de muitas falhas seguidas', async () => {
    const commit = vi.fn(() => Promise.reject(new Error('offline')));
    const onFatal = vi.fn();
    const queue = createPushQueue({ commit, initialRev: 0, wait: noWait, onFatal, maxRetriesAfterClose: 3 });
    queue.push('final');
    queue.close();
    await queue.idle();
    expect(commit).toHaveBeenCalledTimes(4);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });
});

describe('createPushQueue com canMerge (online: só cadeados se juntam)', () => {
  it('passos diferentes são gravados em ordem, um por um', async () => {
    const { commit, calls } = controlledCommit();
    const canMerge = (a, b) => b.step === 'lock'; // "só cadeado" em relação ao anterior
    const queue = createPushQueue({ commit, initialRev: 0, wait: noWait, canMerge });

    queue.push({ step: 'draw1' });
    queue.push({ step: 'lock', n: 1 });
    queue.push({ step: 'lock', n: 2 }); // junta com o cadeado anterior
    queue.push({ step: 'draw2' });
    queue.push({ step: 'score' });
    expect(queue.pendingCount).toBe(3);

    for (let i = 0; i < 4; i++) {
      calls[i].resolve(i + 1);
      await flush();
    }
    await queue.idle();
    expect(calls.map((c) => c.state)).toEqual([
      { step: 'draw1' },
      { step: 'lock', n: 2 },
      { step: 'draw2' },
      { step: 'score' },
    ]);
    expect(calls.map((c) => c.expectedRev)).toEqual([0, 1, 2, 3]);
  });

  it('erro de rede no meio: refaz o mesmo passo e mantém a ordem', async () => {
    const { commit, calls } = controlledCommit();
    const queue = createPushQueue({ commit, initialRev: 0, wait: noWait, canMerge: (a, b) => a === b });
    queue.push('draw');
    queue.push('score');
    calls[0].reject(new Error('offline'));
    await flush();
    expect(calls[1].state).toBe('draw');
    calls[1].resolve(1);
    await flush();
    expect(calls[2]).toMatchObject({ state: 'score', expectedRev: 1 });
    calls[2].resolve(2);
    await queue.idle();
  });
});

describe('ajustes nunca entram numa tirada que espera na fila', () => {
  it('tirada pendente + cadeados: a tirada vai sozinha e os cadeados juntos depois', async () => {
    const { plannedWrites } = await import('../../src/online/pushQueue.js');
    const isLock = (a, b) => b.startsWith('lock');
    expect(plannedWrites(['draw', 'lock1', 'lock2', 'draw2', 'lock3', 'score'], isLock)).toEqual([
      'draw',
      'lock2',
      'draw2',
      'lock3',
      'score',
    ]);
  });
});

describe('sameStep', () => {
  it('só cadeados mudaram → mesmo passo; tirada ou marcação → passo novo', async () => {
    const { createGame, draw, scoreTurn, toggleLock } = await import('../../src/core/game.js');
    const { createSeededRng } = await import('../../src/core/rng.js');
    const { sameStep } = await import('../../src/online/pushQueue.js');
    const rng = createSeededRng(1);
    const s0 = createGame({ modeId: 'basic', players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
    const s1 = draw(s0, rng);
    expect(sameStep(s1, toggleLock(s1, 0))).toBe(true);
    expect(sameStep(s0, s1)).toBe(false);
    expect(sameStep(s1, draw(toggleLock(s1, 0), rng))).toBe(false);
    expect(sameStep(s1, scoreTurn(s1, 'ones'))).toBe(false);
  });
});
