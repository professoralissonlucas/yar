import { h } from '../dom.js';

/** Rótulo da carta: o 1 aparece como "A", como no Yar. */
export function cardLabel(value) {
  return value === 1 ? 'A' : String(value);
}

/** Verso da carta (antes da 1ª tirada). */
export function renderCardBack() {
  return h('div', { class: 'card card--back', 'aria-hidden': 'true' });
}

/**
 * Frente da carta. Todo o visual fica em src/ui/card.css.
 * @param {number} value 1..6
 * @param {{ locked?: boolean, dealt?: boolean, delay?: number, disabled?: boolean,
 *           onClick?: () => void, focusKey?: string }} options
 */
export function renderCard(value, options = {}) {
  const { locked = false, dealt = false, delay = 0, disabled = false, onClick, focusKey } = options;
  const label = cardLabel(value);
  const classes = ['card', locked && 'card--locked', dealt && 'card--dealt']
    .filter(Boolean)
    .join(' ');

  return h(
    'button',
    {
      type: 'button',
      class: classes,
      disabled,
      onClick,
      'aria-pressed': String(locked),
      'aria-label': `Carta ${label}${locked ? ', trancada' : ''}`,
      title: disabled ? null : locked ? 'Clique para destrancar' : 'Clique para trancar',
      style: { '--deal-delay': `${delay}ms` },
      dataset: focusKey ? { focusKey } : undefined,
    },
    h('span', { class: 'card__corner card__corner--top', 'aria-hidden': 'true' }, label),
    h('span', { class: 'card__value', 'aria-hidden': 'true' }, label),
    h('span', { class: 'card__corner card__corner--bottom', 'aria-hidden': 'true' }, label),
    locked && h('span', { class: 'card__lock', 'aria-hidden': 'true' }, '🔒'),
  );
}
