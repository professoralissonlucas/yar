/**
 * Dica das categorias (no lugar do atributo `title`).
 *
 * Gatilhos: elementos com `data-cat-tip="<categoryId>"` dentro de `screenEl`
 * (o nome da categoria na tabela). A dica abre:
 * - ao passar o mouse, na hora;
 * - ao tocar (toca de novo ou fora para fechar);
 * - ao focar com o teclado (Tab).
 * Para leitores de tela o gatilho tem `aria-describedby` apontando para um
 * texto escondido (feito pela tabela); esta dica visual fica `aria-hidden`.
 *
 * Um único elemento flutuante (position: fixed), filho direto de `screenEl`.
 * A tabela é redesenhada a cada jogada: `refresh()` reencontra o gatilho da
 * categoria aberta, atualiza o conteúdo (a mão mudou) e reposiciona.
 */

import { h } from '../dom.js';
import { placeTooltip } from '../placement.js';
import { categoryHelp } from '../texts.js';
import { cardLabel } from './card.js';

/** Depois de um toque, o foco que vem junto não abre a dica (o clique cuida). */
const TOUCH_WINDOW_MS = 800;

/**
 * @param {HTMLElement} screenEl
 * @param {{ getHandPoints?: () => Record<string, number> | null, avoid?: () => (Element | null)[] }} options
 *   getHandPoints: pontos da mão atual por categoria (só na vez do jogador).
 *   avoid: elementos que a dica não pode cobrir (as cartas).
 */
export function attachCategoryTips(screenEl, { getHandPoints = () => null, avoid = () => [] } = {}) {
  const tip = h('div', { class: 'cat-tip', 'aria-hidden': 'true', hidden: true });
  screenEl.append(tip);

  let openId = null;
  let pinned = false; // aberta por toque: só fecha com outro toque
  let lastPointerType = null;
  let lastTouchAt = -Infinity;

  const triggerFrom = (target) => (target instanceof Element ? target.closest('[data-cat-tip]') : null);
  const triggerOf = (id) => screenEl.querySelector(`[data-cat-tip="${id}"]`);
  const isTouch = (type) => type === 'touch' || type === 'pen';

  function content(id) {
    const points = getHandPoints()?.[id];
    const help = categoryHelp(id, typeof points === 'number' ? points : null);
    return [
      h('p', { class: 'cat-tip__name' }, help.name),
      h('p', { class: 'cat-tip__rule' }, help.rule),
      h('p', { class: 'cat-tip__points' }, help.pointsLine),
      h(
        'div',
        { class: 'cat-tip__example' },
        h(
          'span',
          { class: 'mini-hand' },
          help.example.map((v) => h('span', { class: v === 1 ? 'mini-card mini-card--ace' : 'mini-card' }, cardLabel(v))),
        ),
        h('span', { class: 'cat-tip__arrow' }, '→'),
        h('strong', { class: 'cat-tip__score' }, help.exampleScore),
      ),
      help.handLine && h('p', { class: 'cat-tip__hand' }, help.handLine),
    ].filter(Boolean);
  }

  function position(trigger) {
    const anchor = trigger.getBoundingClientRect();
    const size = { width: tip.offsetWidth, height: tip.offsetHeight };
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
    const avoidRects = avoid()
      .filter(Boolean)
      .map((el) => el.getBoundingClientRect());
    const { left, top, placement } = placeTooltip({ anchor, size, viewport, avoid: avoidRects });
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.dataset.placement = placement;
  }

  function markOpen(trigger) {
    for (const el of screenEl.querySelectorAll('[data-cat-tip].is-tip-open')) {
      if (el !== trigger) el.classList.remove('is-tip-open');
    }
    trigger?.classList.add('is-tip-open');
  }

  function open(id, { pin = false } = {}) {
    const trigger = triggerOf(id);
    if (!trigger) {
      close();
      return;
    }
    openId = id;
    pinned = pin;
    tip.replaceChildren(...content(id));
    tip.dataset.category = id;
    tip.hidden = false;
    position(trigger);
    markOpen(trigger);
  }

  function close() {
    openId = null;
    pinned = false;
    tip.hidden = true;
    delete tip.dataset.category;
    markOpen(null);
  }

  function refresh() {
    if (openId) open(openId, { pin: pinned });
  }

  function reposition() {
    if (!openId) return;
    const trigger = triggerOf(openId);
    if (trigger) position(trigger);
    else close();
  }

  // ---------- eventos no próprio screenEl ----------

  function onPointerOver(event) {
    if (event.pointerType !== 'mouse') return;
    const trigger = triggerFrom(event.target);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    open(trigger.dataset.catTip);
  }

  function onPointerOut(event) {
    if (event.pointerType !== 'mouse') return;
    const trigger = triggerFrom(event.target);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    if (openId !== trigger.dataset.catTip || pinned) return;
    if (trigger.matches(':focus-visible')) return; // continua aberta pelo teclado
    close();
  }

  function onFocusIn(event) {
    const trigger = triggerFrom(event.target);
    if (!trigger) return;
    if (performance.now() - lastTouchAt < TOUCH_WINDOW_MS) return;
    if (!trigger.matches(':focus-visible')) return; // foco por clique do mouse
    open(trigger.dataset.catTip);
  }

  function onFocusOut(event) {
    const trigger = triggerFrom(event.target);
    if (!trigger || openId !== trigger.dataset.catTip || pinned) return;
    if (trigger.contains(event.relatedTarget) || trigger.matches(':hover')) return;
    close();
  }

  function onClick(event) {
    const trigger = triggerFrom(event.target);
    if (!trigger || !isTouch(lastPointerType)) return;
    const id = trigger.dataset.catTip;
    if (openId === id && pinned) close();
    else open(id, { pin: true });
  }

  // ---------- eventos globais (saem sozinhos quando a tela sai do DOM) ----------

  const alive = () => {
    if (screenEl.isConnected) return true;
    destroy();
    return false;
  };

  function onDocPointerDown(event) {
    if (!alive()) return;
    lastPointerType = event.pointerType;
    if (isTouch(event.pointerType)) lastTouchAt = performance.now();
    if (!openId) return;
    const trigger = triggerFrom(event.target);
    if (trigger?.dataset.catTip === openId) return; // o clique decide
    close();
  }

  function onDocKeyDown(event) {
    if (!alive()) return;
    lastPointerType = 'keyboard';
    if (event.key === 'Escape' && openId) close();
  }

  function onViewportChange() {
    if (alive()) reposition();
  }

  screenEl.addEventListener('pointerover', onPointerOver);
  screenEl.addEventListener('pointerout', onPointerOut);
  screenEl.addEventListener('focusin', onFocusIn);
  screenEl.addEventListener('focusout', onFocusOut);
  screenEl.addEventListener('click', onClick);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onDocKeyDown, true);
  document.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    screenEl.removeEventListener('pointerover', onPointerOver);
    screenEl.removeEventListener('pointerout', onPointerOut);
    screenEl.removeEventListener('focusin', onFocusIn);
    screenEl.removeEventListener('focusout', onFocusOut);
    screenEl.removeEventListener('click', onClick);
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeyDown, true);
    document.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
    tip.remove();
  }

  return { refresh, close, destroy, get openId() { return openId; } };
}
