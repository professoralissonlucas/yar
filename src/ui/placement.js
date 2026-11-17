/**
 * Posição de uma dica flutuante (puro, sem DOM: recebe retângulos).
 *
 * Retângulos: { left, top, width, height } (como getBoundingClientRect).
 * - anchor: o gatilho.
 * - size: { width, height } da dica.
 * - viewport: { width, height } da janela.
 * - avoid: retângulos que a dica não pode cobrir (as cartas).
 *
 * Tenta, nesta ordem: à direita, abaixo, acima e à esquerda do gatilho. Fica
 * com a primeira que cabe inteira na tela e não cobre nada de `avoid`; se
 * nenhuma servir, usa a que menos cobre e prende dentro da tela.
 */

export const PLACEMENTS = ['right', 'below', 'above', 'left'];

const right = (r) => r.left + r.width;
const bottom = (r) => r.top + r.height;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function overlapArea(a, b) {
  const w = Math.min(right(a), right(b)) - Math.max(a.left, b.left);
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Quanto a dica cobre: cobrir as cartas pesa muito mais que cobrir o próprio gatilho. */
function coverage(rect, anchor, avoid) {
  return overlapArea(rect, anchor) + 100 * avoid.reduce((sum, r) => sum + overlapArea(rect, r), 0);
}

/** Posição "ideal" de cada lado, já alinhada ao gatilho. */
function candidate(placement, anchor, size, gap) {
  switch (placement) {
    case 'right':
      return { left: right(anchor) + gap, top: anchor.top + anchor.height / 2 - size.height / 2 };
    case 'left':
      return { left: anchor.left - gap - size.width, top: anchor.top + anchor.height / 2 - size.height / 2 };
    case 'below':
      return { left: anchor.left, top: bottom(anchor) + gap };
    case 'above':
      return { left: anchor.left, top: anchor.top - gap - size.height };
    default:
      throw new Error(`Posição desconhecida: ${placement}`);
  }
}

export function placeTooltip({ anchor, size, viewport, avoid = [], margin = 8, gap = 8 }) {
  const maxLeft = Math.max(margin, viewport.width - margin - size.width);
  const maxTop = Math.max(margin, viewport.height - margin - size.height);
  const options = PLACEMENTS.map((placement) => {
    const ideal = candidate(placement, anchor, size, gap);
    // no eixo "livre" (vertical para direita/esquerda, horizontal para
    // acima/abaixo) pode deslizar para caber; no outro eixo, não
    const sideways = placement === 'right' || placement === 'left';
    const left = sideways ? ideal.left : clamp(ideal.left, margin, maxLeft);
    const top = sideways ? clamp(ideal.top, margin, maxTop) : ideal.top;
    const rect = { left, top, width: size.width, height: size.height };
    const fits =
      left >= margin - 0.5 &&
      top >= margin - 0.5 &&
      right(rect) <= viewport.width - margin + 0.5 &&
      bottom(rect) <= viewport.height - margin + 0.5;
    const covered = coverage(rect, anchor, avoid);
    return { placement, left, top, fits, covered };
  });

  const best = options.find((o) => o.fits && o.covered === 0);
  if (best) return { left: best.left, top: best.top, placement: best.placement };

  // nenhuma perfeita: prende cada uma na tela e escolhe a que menos cobre
  const clamped = options
    .map((o) => {
      const left = clamp(o.left, margin, maxLeft);
      const top = clamp(o.top, margin, maxTop);
      const rect = { left, top, width: size.width, height: size.height };
      return { placement: o.placement, left, top, covered: coverage(rect, anchor, avoid) };
    })
    .sort((a, b) => a.covered - b.covered);
  const { left, top, placement } = clamped[0];
  return { left, top, placement };
}
