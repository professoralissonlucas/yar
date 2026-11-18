/**
 * Partida online em tempo real: liga a mesa (src/ui/screens/table.js) ao
 * documento da sala.
 *
 * - Jogadas locais → fila (pushQueue) → transação com `rev` (rooms.commitGame).
 *   Se o rev mudou no meio, a jogada é descartada e a mesa redesenha com o
 *   estado do servidor.
 * - Snapshots com rev novo que não foi gravado por mim → table.applyRemote.
 * - Presença: "Oponente desconectado" depois de 60 s sem sinal; depois de
 *   2 min, botão "Encerrar partida" (vitória por abandono).
 */
import { h } from '../ui/dom.js';
import { showTable } from '../ui/screens/table.js';
import { createPushQueue } from './pushQueue.js';
import { fromGameDoc, otherUid, playerName } from './roomState.js';
import { ConflictError, commitGame, forfeit, roomErrorMessage } from './rooms.js';

function classify(error) {
  if (error instanceof ConflictError) return 'conflict';
  if (['permission-denied', 'invalid-argument', 'unauthenticated', 'not-found'].includes(error?.code)) return 'fatal';
  return 'retry';
}

/** Aviso no cabeçalho da mesa: conexão, oponente desconectado, encerrar partida. */
function createBanner({ onForfeit }) {
  const text = h('span', { class: 'online-banner__text' });
  const forfeitButton = h(
    'button',
    { type: 'button', class: 'btn btn--danger btn--small', onClick: onForfeit, hidden: true },
    'Encerrar partida',
  );
  const el = h('div', { class: 'online-banner', role: 'status', 'aria-live': 'polite', hidden: true }, text, forfeitButton);
  let opponent = { status: 'online', name: '' };
  let saving = null; // null | 'retry' | 'error'
  let error = null;

  function paint() {
    let message = '';
    let kind = 'warn';
    if (error) {
      message = error;
      kind = 'error';
    } else if (saving === 'retry') {
      message = 'Sem conexão… tentando salvar a jogada.';
    } else if (opponent.status === 'gone') {
      message = `${opponent.name} está desconectado há mais de 2 minutos.`;
    } else if (opponent.status === 'away') {
      message = 'Oponente desconectado';
    }
    text.textContent = message;
    el.hidden = message === '';
    el.className = `online-banner online-banner--${kind}`;
    forfeitButton.hidden = !(opponent.status === 'gone' && !error && saving === null);
  }

  return {
    el,
    setOpponent(status, name) {
      opponent = { status, name };
      paint();
    },
    setSaving(value) {
      saving = value;
      paint();
    },
    setError(message) {
      error = message;
      paint();
      if (message) setTimeout(() => {
        if (error === message) {
          error = null;
          paint();
        }
      }, 6000);
    },
    setForfeitBusy(busy) {
      forfeitButton.disabled = busy;
    },
  };
}

/**
 * Abre a mesa de uma partida da sala. `onGameOver(state)` quando o core
 * termina (depois do aviso "Fim de jogo!"); `onExit()` quando o jogador sai.
 * Devolve { update(room, { opponentStatus }), destroy(), idle() }.
 */
export function startOnlineMatch(root, { room, uid, onExit, onGameOver }) {
  const code = room.code;
  const opponentId = otherUid(room, uid);
  let lastRoom = room;
  let destroyed = false;

  const banner = createBanner({
    async onForfeit() {
      banner.setForfeitBusy(true);
      try {
        await forfeit(code, uid);
      } catch (error) {
        banner.setError(
          error?.code === 'permission-denied'
            ? 'Ainda não deu 2 minutos para o servidor. Tente de novo daqui a pouco.'
            : roomErrorMessage(error),
        );
      } finally {
        banner.setForfeitBusy(false);
      }
    },
  });

  /** Redesenha a mesa com o que está no servidor. */
  function resyncFromServer(serverRoom) {
    if (destroyed || !serverRoom?.game || serverRoom.match !== room.match) return;
    queue.reset(serverRoom.rev);
    try {
      table.resync(fromGameDoc(serverRoom.game));
    } catch {
      // estado inválido no servidor: mantém a mesa como está
    }
  }

  const queue = createPushQueue({
    initialRev: room.rev,
    commit: (state, expectedRev) => commitGame(code, uid, state, expectedRev),
    classify,
    onConflict: (error) => resyncFromServer(error.room ? { code, ...error.room } : lastRoom),
    onFatal: (error) => {
      banner.setSaving(null);
      banner.setError(`Não foi possível salvar a jogada. ${roomErrorMessage(error)}`);
      resyncFromServer(lastRoom);
    },
    onRetry: () => banner.setSaving('retry'),
    onSaved: () => banner.setSaving(null),
  });

  const state = fromGameDoc(room.game);
  const seats = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    controller: p.id === uid ? 'local' : 'remote',
  }));

  const table = showTable(root, {
    players: seats,
    modeId: state.modeId,
    timerEnabled: room.timerEnabled,
    initialState: state,
    banner: banner.el,
    exitMessage: `Você pode voltar pelo código ${code}. Se ficar fora por mais de 2 minutos, ${playerName(room, opponentId)} poderá encerrar a partida.`,
    onLocalChange: (next) => queue.push(next),
    onExit: () => {
      destroyed = true;
      onExit();
    },
    onGameOver: (finalState) => {
      destroyed = true;
      queue.close(); // a última jogada ainda é gravada
      onGameOver(finalState, seats);
    },
  });

  return {
    seats,
    update(next, { opponentStatus }) {
      lastRoom = next;
      banner.setOpponent(opponentStatus, playerName(next, opponentId));
      if (destroyed || next.match !== room.match || !next.game) return;
      if (queue.isOwnRev(next.rev) || next.rev <= queue.rev) return; // eco da minha jogada, ou antigo
      if (queue.busy) return; // gravação em andamento: se conflitar, a transação avisa
      queue.observe(next.rev);
      try {
        table.applyRemote(fromGameDoc(next.game));
      } catch {
        // estado estranho vindo do outro: ignora
      }
    },
    /** Resolve quando a última jogada local tiver sido gravada. */
    idle: () => queue.idle(),
    /** Fecha a mesa; uma jogada que ainda estiver sendo gravada termina de gravar. */
    destroy() {
      destroyed = true;
      queue.close();
      table.destroy();
    },
  };
}
