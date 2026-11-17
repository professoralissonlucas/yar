/**
 * Contagem regressiva do turno. Usa o relógio real (Date.now) para não
 * atrasar quando a aba fica em segundo plano.
 */
export function createTurnTimer({ seconds, onTick, onExpire }) {
  let intervalId = null;
  let endAt = 0;

  function secondsLeft() {
    return Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  }

  function stop() {
    if (intervalId !== null) clearInterval(intervalId);
    intervalId = null;
  }

  function start() {
    stop();
    endAt = Date.now() + seconds * 1000;
    onTick(seconds);
    intervalId = setInterval(() => {
      const left = secondsLeft();
      onTick(left);
      if (left <= 0) {
        stop();
        onExpire();
      }
    }, 250);
  }

  return { start, stop };
}

export function formatSeconds(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
