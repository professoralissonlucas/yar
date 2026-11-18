import { otherUid, playerName, rematchInfo } from '../../../online/roomState.js';
import { h } from '../../dom.js';
import { showGameOver } from '../gameOver.js';
import { messageLine } from './common.js';

/**
 * Resultado da partida online: placar final, "Revanche" (a partida recomeça
 * na mesma sala quando os dois clicam) e "Sair da sala".
 * `result`: só no abandono (vitória de quem ficou). Devolve { update(room, …) }.
 */
export function showOnlineResult(root, { state, seats, room, uid, result = null, onRematch, onLeave }) {
  const opponentId = otherUid(room, uid);
  const opponentName = () => playerName(room, opponentId);
  const status = h('p', { class: 'rematch-status', role: 'status', 'aria-live': 'polite' });
  const error = messageLine('error');
  let voting = false;

  const rematchButton = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--primary btn--xl',
      onClick: async () => {
        error.set('');
        voting = true;
        paint(room);
        try {
          await onRematch();
        } catch (e) {
          error.set(e?.message ?? String(e));
        } finally {
          voting = false;
          paint(room);
        }
      },
    },
    'Revanche',
  );
  const leaveButton = h('button', { type: 'button', class: 'btn btn--ghost btn--xl', onClick: onLeave }, 'Sair da sala');
  const actions = h(
    'div',
    { class: 'gameover-online' },
    status,
    h('div', { class: 'gameover-actions' }, rematchButton, leaveButton),
    error.el,
  );

  const forfeitUid = result?.forfeitUid ?? null;
  let note = null;
  if (forfeitUid === uid) note = 'Você ficou desconectado e a partida foi encerrada por abandono.';
  else if (forfeitUid) note = `${opponentName()} saiu da partida: vitória por abandono.`;

  showGameOver(root, { state, seats, result, note, actions });

  function paint(current, opponentStatus = 'online') {
    const { mine, theirs } = rematchInfo(current, uid);
    rematchButton.disabled = voting || mine;
    rematchButton.textContent = theirs && !mine ? 'Aceitar revanche' : mine ? 'Revanche pedida' : 'Revanche';
    if (current.status !== 'finished') status.textContent = 'Salvando o resultado…';
    else if (mine && !theirs) status.textContent = `Aguardando ${opponentName()} aceitar a revanche…`;
    else if (theirs && !mine) status.textContent = `${opponentName()} quer revanche!`;
    else if (opponentStatus !== 'online') status.textContent = `${opponentName()} está desconectado.`;
    else status.textContent = '';
    // a revanche só pode ser pedida depois que o fim da partida foi salvo
    if (current.status !== 'finished') rematchButton.disabled = true;
  }

  paint(room);

  return {
    update(next, { opponentStatus }) {
      room = next;
      paint(next, opponentStatus);
    },
  };
}
