import { NICKNAME_MAX_LENGTH, cleanNickname } from '../../../online/nickname.js';
import { h } from '../../dom.js';
import { messageLine, onlineHeader } from './common.js';

const GOOGLE_LOGO = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'google-logo');
  const paths = [
    ['#FFC107', 'M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z'],
    ['#FF3D00', 'M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z'],
    ['#4CAF50', 'M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z'],
    ['#1976D2', 'M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z'],
  ];
  for (const [fill, d] of paths) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('fill', fill);
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
};

/**
 * Tela de login: "Entrar com Google" ou "Jogar como convidado".
 * onGoogle/onGuest devolvem promessas; erros são mostrados com setError.
 */
export function showLogin(root, { onGoogle, onGuest, onBack, notice }) {
  const error = messageLine('error');
  const buttons = [];
  const run = (action) => async () => {
    error.set('');
    buttons.forEach((b) => (b.disabled = true));
    try {
      await action();
    } catch (e) {
      error.set(e?.message ?? String(e));
    } finally {
      if (buttons[0].isConnected) buttons.forEach((b) => (b.disabled = false));
    }
  };
  buttons.push(
    h('button', { type: 'button', class: 'btn btn--light btn--xl', onClick: run(onGoogle) }, GOOGLE_LOGO(), 'Entrar com Google'),
    h('button', { type: 'button', class: 'btn btn--ghost btn--xl', onClick: run(onGuest) }, 'Jogar como convidado'),
  );
  root.replaceChildren(
    h(
      'div',
      { class: 'screen online-screen' },
      onlineHeader({ title: 'Jogar online', subtitle: 'Entre para criar uma sala ou usar o código de um amigo.', onBack }),
      h(
        'section',
        { class: 'panel online-card stack' },
        notice && h('p', { class: 'online-message online-message--info' }, notice),
        h('div', { class: 'login-buttons' }, buttons),
        h('p', { class: 'muted small' }, 'Como convidado você não precisa de conta, mas perde o acesso se sair.'),
        error.el,
      ),
    ),
  );
  buttons[0].focus();
}

/** Confirmação do apelido (até 16 caracteres). onConfirm(apelido). */
export function showNickname(root, { initial, account, onConfirm, onBack }) {
  const input = h('input', {
    type: 'text',
    name: 'nickname',
    value: initial,
    maxlength: NICKNAME_MAX_LENGTH,
    autocomplete: 'nickname',
    placeholder: 'Seu apelido',
    required: true,
    onInput: update,
  });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary btn--xl' }, 'Continuar');
  const hint = h('p', { class: 'form-hint', 'aria-live': 'polite' });

  function update() {
    const empty = cleanNickname(input.value) === '';
    submit.disabled = empty;
    hint.textContent = empty ? 'Digite um apelido para continuar.' : '';
  }

  const form = h(
    'form',
    {
      class: 'panel online-card stack',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        update();
        if (!submit.disabled) onConfirm(cleanNickname(input.value));
      },
    },
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Apelido (é o nome que seu amigo vê)'), input),
    h('div', { class: 'form-actions form-actions--start' }, submit, hint),
  );
  update();
  root.replaceChildren(
    h(
      'div',
      { class: 'screen online-screen' },
      onlineHeader({ title: 'Seu apelido', onBack, account }),
      form,
    ),
  );
  input.focus();
  input.select();
}
