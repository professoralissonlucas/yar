import { h } from '../dom.js';

/** Diálogos abertos (para poder fechá-los todos, ex.: quando o tempo acaba). */
const openDialogs = new Set();

/** Fecha todos os diálogos/avisos abertos (confirmações resolvem como "cancelar"). */
export function closeDialogs() {
  for (const entry of [...openDialogs]) entry.close();
}

/** Modal de confirmação. Resolve `true` (confirmou) ou `false` (cancelou/fechou). */
export function confirmDialog({
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
}) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    let overlay;

    const entry = { close: () => close(false) };
    const onKey = (event) => {
      if (event.key === 'Escape') close(false);
    };
    function close(result) {
      if (!openDialogs.has(entry)) return;
      openDialogs.delete(entry);
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(result);
    }

    const confirmButton = h(
      'button',
      { type: 'button', class: danger ? 'btn btn--danger' : 'btn btn--primary', onClick: () => close(true) },
      confirmText,
    );
    overlay = h(
      'div',
      {
        class: 'overlay',
        onClick: (event) => {
          if (event.target === overlay) close(false);
        },
      },
      h(
        'div',
        { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' },
        h('h2', { id: 'dialog-title', class: 'dialog__title' }, title),
        message && h('p', { class: 'dialog__message' }, message),
        h(
          'div',
          { class: 'dialog__actions' },
          h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => close(false) }, cancelText),
          confirmButton,
        ),
      ),
    );

    openDialogs.add(entry);
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    confirmButton.focus();
  });
}

/** Aviso grande ("Vez de Ana"). Some com clique, tecla ou após `duration` ms. */
export function showTurnNotice({ title, subtitle, duration = 1600 }) {
  return new Promise((resolve) => {
    let overlay;
    let timeoutId;

    const entry = { close: () => close() };
    const onKey = (event) => {
      if (['Enter', ' ', 'Escape'].includes(event.key)) {
        event.preventDefault();
        close();
      }
    };
    function close() {
      if (!openDialogs.has(entry)) return;
      openDialogs.delete(entry);
      clearTimeout(timeoutId);
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve();
    }

    overlay = h(
      'div',
      { class: 'overlay overlay--notice', onClick: () => close() },
      h(
        'div',
        { class: 'turn-notice', role: 'status', 'aria-live': 'assertive' },
        h('p', { class: 'turn-notice__title' }, title),
        subtitle && h('p', { class: 'turn-notice__subtitle' }, subtitle),
        h('p', { class: 'turn-notice__hint' }, 'Clique para continuar'),
      ),
    );

    openDialogs.add(entry);
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    timeoutId = setTimeout(close, duration);
  });
}
