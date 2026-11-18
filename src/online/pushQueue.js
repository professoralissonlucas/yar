/**
 * Fila de gravação do jogador da vez (pura: o Firebase entra por `commit`).
 *
 * - Guarda só o estado MAIS NOVO: vários cliques rápidos (cadeados) viram uma
 *   gravação só, e as gravações nunca correm em paralelo.
 * - `commit(state, expectedRev)` grava com transação e devolve o novo rev; se o
 *   rev mudou no meio, ela lança um erro que `classify` chama de 'conflict' →
 *   a fila descarta o que tinha e chama `onConflict(error)` (a mesa redesenha
 *   com o estado do servidor).
 * - Erros 'retry' (rede) tentam de novo com espera crescente; 'fatal' para.
 * - Os revs gravados por mim ficam marcados (`isOwnRev`) para o eco do
 *   onSnapshot ser ignorado.
 */
export function createPushQueue({
  commit,
  initialRev,
  classify = () => 'retry',
  onConflict = () => {},
  onFatal = () => {},
  onRetry = () => {},
  onSaved = () => {},
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  retryDelayMs = 1000,
  maxRetryDelayMs = 5000,
  maxRetriesAfterClose = 10,
}) {
  let rev = initialRev;
  let latest = null;
  let running = false;
  let closed = false; // não aceita mais jogadas (o que já estava agendado ainda é gravado)
  let stopped = false; // desiste de tudo (saiu da sala)
  const ownRevs = new Set();
  let idleWaiters = [];

  function settle() {
    running = false;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  async function run() {
    running = true;
    let failures = 0;
    while (latest !== null && !stopped) {
      const state = latest;
      latest = null;
      const target = rev + 1;
      ownRevs.add(target);
      try {
        rev = await commit(state, rev);
        failures = 0;
        if (latest === null) onSaved();
      } catch (error) {
        ownRevs.delete(target);
        const kind = classify(error);
        if (kind === 'conflict') {
          latest = null;
          onConflict(error);
          break;
        }
        if (kind === 'fatal' || stopped || (closed && failures >= maxRetriesAfterClose)) {
          latest = null;
          onFatal(error);
          break;
        }
        failures += 1;
        onRetry(error, failures);
        if (latest === null) latest = state; // tenta de novo (ou já há um estado mais novo)
        await wait(Math.min(retryDelayMs * failures, maxRetryDelayMs));
      }
    }
    settle();
  }

  return {
    /** Agenda o estado para gravar (substitui um anterior que ainda não foi). */
    push(state) {
      if (closed) return;
      latest = state;
      if (!running) run();
    },
    /** Esse rev foi gravado (ou está sendo gravado) por mim? */
    isOwnRev: (value) => ownRevs.has(value),
    /** Rev atual conhecido. */
    get rev() {
      return rev;
    },
    get busy() {
      return running;
    },
    /** Rev novo visto no servidor (jogada do outro). Ignorado durante uma gravação. */
    observe(serverRev) {
      if (!running && serverRev > rev) rev = serverRev;
    },
    /** Depois de redesenhar com o estado do servidor (conflito). */
    reset(serverRev) {
      latest = null;
      rev = serverRev;
    },
    /** Resolve quando não houver mais nada para gravar. */
    idle() {
      return running ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve();
    },
    /** Para de aceitar jogadas; o que já estava agendado ainda é gravado. */
    close() {
      closed = true;
    },
    /** Desiste de gravar (saiu da sala). */
    stop() {
      closed = true;
      stopped = true;
      latest = null;
    },
  };
}
