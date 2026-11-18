import { h } from '../../dom.js';

/** Só avisa se a queda durar isso (evita piscar em oscilações rápidas). */
const OFFLINE_GRACE_MS = 1500;
const BACK_ONLINE_MS = 3000;

/**
 * Aviso fixo no topo da tela, em todas as telas online:
 * "Sem internet — tentando reconectar…" enquanto a conexão estiver caída e
 * "Conexão restabelecida" por 3 s quando ela voltar.
 * `set('online' | 'offline')`; `destroy()` remove.
 */
export function createConnectionToast() {
  const text = h('span', {});
  const el = h('div', { class: 'connection-toast', role: 'status', 'aria-live': 'polite', hidden: true }, text);
  document.body.append(el);
  let shown = false;
  let graceTimer = null;
  let hideTimer = null;

  function show(kind, message) {
    clearTimeout(hideTimer);
    el.className = `connection-toast connection-toast--${kind}`;
    text.textContent = message;
    el.hidden = false;
  }

  return {
    set(status) {
      if (status === 'offline') {
        if (shown || graceTimer !== null) return;
        graceTimer = setTimeout(() => {
          graceTimer = null;
          shown = true;
          show('offline', 'Sem internet — tentando reconectar…');
        }, OFFLINE_GRACE_MS);
        return;
      }
      clearTimeout(graceTimer);
      graceTimer = null;
      if (!shown) return;
      shown = false;
      show('online', 'Conexão restabelecida ✓');
      hideTimer = setTimeout(() => {
        el.hidden = true;
      }, BACK_ONLINE_MS);
    },
    destroy() {
      clearTimeout(graceTimer);
      clearTimeout(hideTimer);
      el.remove();
    },
  };
}
