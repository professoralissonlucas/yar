import { extractRoomCode, isValidRoomCode } from '../../../online/roomCode.js';
import { JOIN_ERROR_MESSAGES } from '../../../online/roomState.js';
import { h } from '../../dom.js';
import { renderModePicker, renderTimerSwitch } from '../start.js';
import { messageLine, onlineHeader } from './common.js';

let lobbyCount = 0;

/**
 * Lobby online: "Criar sala" (modo + timer) e "Entrar com código".
 * onCreate({ modeId, timerEnabled }) e onJoin(code) devolvem promessas; se
 * falharem, a mensagem do erro aparece no painel correspondente.
 */
export function showLobby(root, { account, onBack, initialModeId, initialTimer, initialCode = '', notice, onCreate, onJoin }) {
  const id = `lobby-${++lobbyCount}`;
  const createError = messageLine('error');
  const joinErrorLine = messageLine('error');
  const createButton = h('button', { type: 'submit', class: 'btn btn--primary btn--large' }, 'Criar sala');
  const joinButton = h('button', { type: 'submit', class: 'btn btn--primary btn--large' }, 'Entrar');
  const codeInput = h('input', {
    type: 'text',
    name: 'code',
    class: 'code-input',
    value: extractRoomCode(initialCode),
    // sem limite curto: o jogador pode colar o link inteiro do convite
    maxlength: 500,
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    inputmode: 'text',
    placeholder: 'ABC234',
    'aria-label': 'Código da sala (6 caracteres) ou link do convite',
    'aria-describedby': `${id}-code-hint`,
    onInput: () => {
      const start = codeInput.selectionStart;
      const before = codeInput.value;
      codeInput.value = extractRoomCode(before);
      // mantém o cursor no lugar quando só mudou maiúscula/minúscula
      if (before.length === codeInput.value.length) codeInput.setSelectionRange(start, start);
      updateJoin();
    },
  });

  function updateJoin() {
    joinButton.disabled = !isValidRoomCode(codeInput.value);
  }

  const busyWhile = async (buttons, error, action) => {
    error.set('');
    buttons.forEach((b) => (b.disabled = true));
    try {
      await action();
    } catch (e) {
      error.set(e?.message ?? String(e));
    } finally {
      buttons.forEach((b) => (b.disabled = false));
      updateJoin();
    }
  };

  const createForm = h(
    'form',
    {
      class: 'panel online-card stack',
      'aria-labelledby': `${id}-create`,
      onSubmit: (event) => {
        event.preventDefault();
        const data = new FormData(createForm);
        busyWhile([createButton, joinButton], createError, () =>
          onCreate({ modeId: String(data.get('mode')), timerEnabled: data.get('timer') === 'on' }),
        );
      },
    },
    h('h2', { class: 'section-title', id: `${id}-create` }, 'Criar sala'),
    h('p', { class: 'muted small', id: `${id}-modes` }, 'Escolha o modo de jogo. Você recebe um código para mandar ao seu amigo.'),
    renderModePicker({ selectedId: initialModeId, labelledBy: `${id}-modes` }),
    renderTimerSwitch({ checked: initialTimer, note: h('span', { class: 'muted' }, ' (vale para os dois)') }),
    h('div', { class: 'form-actions form-actions--start' }, createButton),
    createError.el,
  );

  const joinForm = h(
    'form',
    {
      class: 'panel online-card stack',
      'aria-labelledby': `${id}-join`,
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const code = extractRoomCode(codeInput.value);
        if (!isValidRoomCode(code)) {
          joinErrorLine.set(JOIN_ERROR_MESSAGES.invalid);
          return;
        }
        busyWhile([createButton, joinButton], joinErrorLine, () => onJoin(code));
      },
    },
    h('h2', { class: 'section-title', id: `${id}-join` }, 'Entrar com código'),
    h('div', { class: 'join-row' }, codeInput, joinButton),
    h('p', { class: 'muted small', id: `${id}-code-hint` }, 'Digite o código de 6 caracteres ou cole o link do convite.'),
    joinErrorLine.el,
  );

  updateJoin();
  root.replaceChildren(
    h(
      'div',
      { class: 'screen online-screen' },
      onlineHeader({ title: 'Jogar online', onBack, backText: 'Início', account }),
      notice && h('p', { class: 'online-message online-message--info', role: 'status' }, notice),
      joinForm,
      createForm,
    ),
  );

  return {
    /** Mostra um erro no painel "Entrar com código" (ex.: link de convite inválido). */
    showJoinError: (text) => joinErrorLine.set(text),
  };
}
