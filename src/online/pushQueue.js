/**
 * Fila de gravação do jogador da vez (pura: o Firebase entra por `commit`).
 *
 * - Grava em série, na ordem das jogadas. `canMerge(anterior, novo)` diz se o
 *   novo estado é só um "ajuste" do anterior (no online: só cadeados mudaram).
 *   Um estado novo só SUBSTITUI o último da fila quando os DOIS são ajustes —
 *   assim um clique de cadeado nunca é fundido numa tirada que ainda espera na
 *   fila. Tiradas e marcações viram gravações separadas, porque as regras do
 *   Firestore exigem que `drawsUsed` suba de 1 em 1, que a tirada não mexa nos
 *   cadeados e que cada marcação parta de uma mão já gravada.
 * - `commit(state, expectedRev)` grava com transação e devolve o novo rev; se o
 *   rev mudou no meio, ela lança um erro que `classify` chama de 'conflict' →
 *   a fila descarta tudo e chama `onConflict(error)` (a mesa redesenha com o
 *   estado do servidor).
 * - Erros 'retry' (rede) tentam de novo com espera crescente; 'fatal' para.
 * - Os revs gravados por mim ficam marcados (`isOwnRev`) para o eco do
 *   onSnapshot ser ignorado.
 */
export function createPushQueue({
  commit,
  initialRev,
  canMerge = () => true,
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
  let pending = []; // { state, mergeable } a gravar, em ordem
  let lastPushed; // último estado recebido (para saber se o próximo é só um ajuste)
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
    while (pending.length > 0 && !stopped) {
      const entry = pending.shift();
      const { state } = entry;
      const target = rev + 1;
      ownRevs.add(target);
      try {
        rev = await commit(state, rev);
        failures = 0;
        if (pending.length === 0) onSaved();
      } catch (error) {
        ownRevs.delete(target);
        const kind = classify(error);
        if (kind === 'conflict') {
          pending = [];
          onConflict(error);
          break;
        }
        failures += 1;
        if (kind === 'fatal' || stopped || (closed && failures > maxRetriesAfterClose)) {
          pending = [];
          onFatal(error);
          break;
        }
        onRetry(error, failures);
        // tenta de novo — a não ser que o próximo da fila seja este mesmo
        // ajuste com mais cadeados (aí ele substitui este)
        if (!(entry.mergeable && pending[0]?.mergeable)) pending.unshift(entry);
        await wait(Math.min(retryDelayMs * failures, maxRetryDelayMs));
      }
    }
    settle();
  }

  return {
    /** Agenda o estado para gravar (substitui o último da fila se for do mesmo passo). */
    push(state) {
      if (closed) return;
      pending = enqueue(pending, lastPushed, state, canMerge);
      lastPushed = state;
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
    /** Quantos estados esperam para ser gravados (fora o que está saindo). */
    get pendingCount() {
      return pending.length;
    },
    /** Rev novo visto no servidor (jogada do outro). Ignorado durante uma gravação. */
    observe(serverRev) {
      if (!running && serverRev > rev) rev = serverRev;
    },
    /** Depois de redesenhar com o estado do servidor (conflito). */
    reset(serverRev) {
      pending = [];
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
      pending = [];
    },
  };
}

/**
 * Põe `state` na fila. `previous` é o último estado recebido antes dele
 * (gravado ou não). Se o novo é só um ajuste do anterior e o último da fila
 * também é um ajuste, o novo substitui o último; senão entra no fim.
 */
export function enqueue(pending, previous, state, canMerge) {
  const mergeable = previous !== undefined && canMerge(previous, state);
  const last = pending[pending.length - 1];
  if (mergeable && last?.mergeable) return [...pending.slice(0, -1), { state, mergeable }];
  return [...pending, { state, mergeable }];
}

/**
 * Sequência de gravações se a fila juntasse ao máximo (todos os estados
 * esperando ao mesmo tempo). Usado nos testes das regras.
 */
export function plannedWrites(states, canMerge) {
  let pending = [];
  let previous;
  for (const state of states) {
    pending = enqueue(pending, previous, state, canMerge);
    previous = state;
  }
  return pending.map((entry) => entry.state);
}

/**
 * No online: dois estados podem virar uma gravação só quando são o mesmo
 * "passo" — mesma vez, mesmo nº de tiradas, mesmo placar (ou seja, só mudaram
 * os cadeados).
 */
export function sameStep(a, b) {
  return (
    a.currentPlayerIndex === b.currentPlayerIndex &&
    a.round === b.round &&
    a.status === b.status &&
    a.turn.drawsUsed === b.turn.drawsUsed &&
    JSON.stringify(a.scores) === JSON.stringify(b.scores)
  );
}
