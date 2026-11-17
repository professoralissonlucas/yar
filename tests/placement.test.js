import { describe, expect, it } from 'vitest';
import { placeTooltip } from '../src/ui/placement.js';

const viewport = { width: 1280, height: 620 };
const size = { width: 280, height: 160 };
const rect = (left, top, width, height) => ({ left, top, width, height });

function overlaps(a, b) {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

function inside(pos, vp = viewport, margin = 8) {
  return (
    pos.left >= margin &&
    pos.top >= margin &&
    pos.left + size.width <= vp.width - margin &&
    pos.top + size.height <= vp.height - margin
  );
}

describe('placeTooltip', () => {
  it('prefere à direita do gatilho, centralizada na altura', () => {
    const anchor = rect(20, 200, 120, 28);
    const pos = placeTooltip({ anchor, size, viewport });
    expect(pos.placement).toBe('right');
    expect(pos.left).toBe(20 + 120 + 8);
    expect(pos.top).toBe(200 + 14 - 80);
  });

  it('desliza na vertical para não sair da tela (linha do topo e do fim)', () => {
    const top = placeTooltip({ anchor: rect(20, 10, 120, 28), size, viewport });
    expect(top.placement).toBe('right');
    expect(top.top).toBe(8);
    const bottom = placeTooltip({ anchor: rect(20, 590, 120, 28), size, viewport });
    expect(bottom.placement).toBe('right');
    expect(bottom.top).toBe(620 - 8 - 160);
  });

  it('não cobre as cartas: troca de lado quando a direita cruza a mão', () => {
    const anchor = rect(20, 300, 120, 28);
    const hand = rect(300, 200, 500, 160);
    const pos = placeTooltip({ anchor, size, viewport, avoid: [hand] });
    expect(pos.placement).not.toBe('right');
    expect(overlaps({ ...pos, ...size }, hand)).toBe(false);
    expect(inside(pos)).toBe(true);
  });

  it('nunca sai da tela, com gatilhos em qualquer canto', () => {
    const anchors = [
      rect(0, 0, 100, 30),
      rect(1180, 0, 100, 30),
      rect(0, 590, 100, 30),
      rect(1180, 590, 100, 30),
      rect(600, 300, 100, 30),
    ];
    for (const anchor of anchors) {
      expect(inside(placeTooltip({ anchor, size, viewport }))).toBe(true);
    }
  });

  it('celular: dica mais larga que o espaço lateral vai para cima ou para baixo', () => {
    const phone = { width: 390, height: 750 };
    const tip = { width: 374, height: 150 };
    const dock = rect(0, 450, 390, 300);
    const pos = placeTooltip({ anchor: rect(16, 200, 140, 36), size: tip, viewport: phone, avoid: [dock] });
    expect(['below', 'above']).toContain(pos.placement);
    expect(overlaps({ ...pos, ...tip }, dock)).toBe(false);
  });

  it('sem posição perfeita: fica na tela e cobre o mínimo das cartas', () => {
    const small = { width: 400, height: 300 };
    const hand = rect(0, 0, 400, 140); // metade de cima inteira
    const pos = placeTooltip({ anchor: rect(150, 150, 100, 20), size: { width: 300, height: 140 }, viewport: small, avoid: [hand] });
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.top).toBeGreaterThanOrEqual(8);
    expect(pos.left + 300).toBeLessThanOrEqual(392);
    expect(pos.top + 140).toBeLessThanOrEqual(292);
    expect(overlaps({ ...pos, width: 300, height: 140 }, hand)).toBe(false);
  });
});
