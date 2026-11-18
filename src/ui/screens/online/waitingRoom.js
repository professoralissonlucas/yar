import { getMode } from '../../../core/modes.js';
import { inviteUrl } from '../../../online/roomCode.js';
import { playerName } from '../../../online/roomState.js';
import { h } from '../../dom.js';
import { initialOf, pluralize, stars } from '../../texts.js';
import { messageLine, onlineHeader } from './common.js';

/** Copia o texto; sem a API de área de transferência, seleciona o campo para o jogador copiar. */
async function copyText(text, fallbackInput) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    fallbackInput.hidden = false;
    fallbackInput.focus();
    fallbackInput.select();
    return false;
  }
}

/**
 * Sala de espera: código grande, "Copiar convite", quem está na sala e
 * "Começar" (só o anfitrião, quando o amigo já entrou).
 * Devolve { update(room, { uid, opponentStatus }) }.
 */
export function showWaitingRoom(root, { code, account, onLeave, onStart }) {
  const link = inviteUrl(code);
  const copyStatus = h('span', { class: 'copy-status', role: 'status' });
  const linkInput = h('input', { type: 'text', class: 'invite-link', value: link, readonly: true, 'aria-label': 'Link do convite' });
  linkInput.hidden = true;
  const copyButton = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--ghost',
      onClick: async () => {
        const ok = await copyText(link, linkInput);
        copyStatus.textContent = ok ? 'Convite copiado!' : 'Copie o link abaixo:';
        if (ok) setTimeout(() => (copyStatus.textContent = ''), 2500);
      },
    },
    'Copiar convite',
  );
  const modeLine = h('p', { class: 'muted' });
  const playersEl = h('ul', { class: 'room-players' });
  const statusEl = h('p', { class: 'room-status', role: 'status', 'aria-live': 'polite' });
  const error = messageLine('error');
  let starting = false;
  const startButton = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--primary btn--xl',
      onClick: async () => {
        error.set('');
        starting = true;
        startButton.disabled = true;
        try {
          await onStart();
        } catch (e) {
          error.set(e?.message ?? String(e));
          startButton.disabled = false;
        } finally {
          starting = false;
        }
      },
    },
    'Começar',
  );

  root.replaceChildren(
    h(
      'div',
      { class: 'screen online-screen' },
      onlineHeader({ title: 'Sala de espera', onBack: onLeave, backText: 'Sair da sala', account }),
      h(
        'section',
        { class: 'panel online-card stack room-card' },
        h('p', { class: 'kicker' }, 'Código da sala'),
        h('p', { class: 'room-code', 'aria-label': `Código ${code.split('').join(' ')}` }, code),
        h('div', { class: 'copy-row' }, copyButton, copyStatus),
        linkInput,
        h('p', { class: 'muted small' }, 'Mande o convite (ou só o código) para o seu amigo.'),
        modeLine,
      ),
      h('section', { class: 'panel online-card stack' }, h('h2', { class: 'section-title' }, 'Jogadores'), playersEl, statusEl, startButton, error.el),
    ),
  );

  function update(room, { uid, opponentStatus = 'online' }) {
    const mode = getMode(room.mode);
    modeLine.replaceChildren(
      `Modo ${mode.name} `,
      h('span', { class: 'stars' }, stars(mode.stars)),
      ` · ${pluralize(mode.maxDraws, 'tirada', 'tiradas')}`,
      room.timerEnabled ? ' · timer de 45 s' : ' · sem timer',
    );
    const seat = (id, role) => {
      const name = playerName(room, id);
      return h(
        'li',
        { class: 'room-player' },
        h('span', { class: 'seat-initial', 'aria-hidden': 'true' }, initialOf(name)),
        h('strong', {}, name),
        h('span', { class: 'muted small' }, role, id === uid ? ' · você' : ''),
        id !== uid && opponentStatus !== 'online' && h('span', { class: 'badge' }, 'desconectado'),
      );
    };
    playersEl.replaceChildren(
      seat(room.hostUid, 'anfitrião'),
      room.guestUid
        ? seat(room.guestUid, 'convidado')
        : h('li', { class: 'room-player room-player--empty' }, h('span', { class: 'muted' }, 'Aguardando amigo...')),
    );
    const isHost = room.hostUid === uid;
    startButton.hidden = !isHost;
    if (!room.guestUid) {
      statusEl.textContent = 'Aguardando amigo...';
      startButton.disabled = true;
    } else if (isHost) {
      statusEl.textContent = `${playerName(room, room.guestUid)} entrou! Clique em “Começar”. Quem começa é sorteado.`;
      if (!starting) startButton.disabled = false;
    } else {
      statusEl.textContent = `Aguardando ${playerName(room, room.hostUid)} começar a partida…`;
    }
  }

  return { update };
}
