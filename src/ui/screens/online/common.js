import { accountLabel } from '../../../online/nickname.js';
import { h } from '../../dom.js';

/**
 * Cabeçalho das telas online: voltar, título e (logado) quem está jogando + "Sair".
 * `account`: { user, nickname, onSignOut } ou null.
 */
export function onlineHeader({ title, subtitle, backText = 'Voltar', onBack, account = null }) {
  return h(
    'header',
    { class: 'online-header' },
    h(
      'div',
      { class: 'online-header__bar' },
      onBack
        ? h('button', { type: 'button', class: 'btn btn--ghost btn--small', onClick: onBack }, `← ${backText}`)
        : h('span'),
      account &&
        h(
          'div',
          { class: 'account' },
          h(
            'span',
            { class: 'account__label' },
            h('span', { class: 'muted' }, 'Logado como '),
            h('strong', {}, accountLabel(account.user, account.nickname)),
          ),
          h('button', { type: 'button', class: 'btn btn--ghost btn--small', onClick: account.onSignOut }, 'Sair'),
        ),
    ),
    h('h1', { class: 'online-header__title' }, title),
    subtitle && h('p', { class: 'muted' }, subtitle),
  );
}

/** Parágrafo de erro/aviso que pode ser atualizado (`set(texto)`). */
export function messageLine(kind = 'error') {
  const el = h('p', { class: `online-message online-message--${kind}`, role: kind === 'error' ? 'alert' : 'status' });
  el.hidden = true;
  return {
    el,
    set(text) {
      el.textContent = text ?? '';
      el.hidden = !text;
    },
  };
}
