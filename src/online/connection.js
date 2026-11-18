/**
 * Estado da conexão no modo online (puro, sem DOM nem Firebase).
 *
 * Duas fontes: o navegador (`navigator.onLine` e os eventos online/offline,
 * que avisam na hora quando o Wi-Fi cai) e o Firestore (`fromCache` dos
 * snapshots: true quando o listener perdeu o servidor). Está 'online' só
 * quando as duas dizem que sim. `onChange(status, previous)` a cada troca.
 */
export function createConnectionState({ browserOnline = true, onChange = () => {} } = {}) {
  let browser = browserOnline;
  let server = true;
  let status = browser ? 'online' : 'offline';

  function update() {
    const next = browser && server ? 'online' : 'offline';
    if (next === status) return;
    const previous = status;
    status = next;
    onChange(next, previous);
  }

  return {
    get status() {
      return status;
    },
    setBrowserOnline(value) {
      browser = Boolean(value);
      update();
    },
    /** `fromCache` do último snapshot da sala (false ao sair da sala). */
    setFromCache(fromCache) {
      server = !fromCache;
      update();
    },
  };
}
