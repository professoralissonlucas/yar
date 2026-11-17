import { MODES } from '../../core/modes.js';
import { h } from '../dom.js';
import { categoryName, categoryTooltip, pluralize, stars } from '../texts.js';

export const NAME_MAX_LENGTH = 16;
export const DEFAULT_NAMES = ['Jogador 1', 'Jogador 2'];

/** Tipos de partida. Os desabilitados aparecem como "em breve". */
const MATCH_TYPES = [
  { id: 'local', label: '2 jogadores', detail: 'no mesmo computador', enabled: true },
  { id: 'ai', label: 'Contra a máquina', detail: 'Igor, Eileen ou Islin', enabled: false },
  { id: 'online', label: 'Online', detail: 'contra um amigo', enabled: false },
];

/**
 * Tela de início.
 * onPlay({ matchType, names: [string, string], modeId, timerEnabled })
 */
export function showStart(root, { initial, onPlay }) {
  const names = initial.names ?? DEFAULT_NAMES;

  const matchTypeOption = (type) =>
    h(
      'label',
      { class: `choice${type.enabled ? '' : ' choice--disabled'}` },
      h('input', {
        type: 'radio',
        name: 'matchType',
        value: type.id,
        checked: type.id === 'local',
        disabled: !type.enabled,
      }),
      h(
        'span',
        { class: 'choice__body' },
        h('span', { class: 'choice__title' }, type.label),
        h('span', { class: 'choice__detail' }, type.detail),
        !type.enabled && h('span', { class: 'badge' }, 'em breve'),
      ),
    );

  const nameField = (index) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, `Jogador ${index + 1}`),
      h('input', {
        type: 'text',
        name: `name${index}`,
        value: names[index] ?? DEFAULT_NAMES[index],
        maxlength: NAME_MAX_LENGTH,
        autocomplete: 'off',
        placeholder: DEFAULT_NAMES[index],
        required: false,
      }),
    );

  const modeOption = (mode) =>
    h(
      'label',
      { class: 'choice mode-option' },
      h('input', { type: 'radio', name: 'mode', value: mode.id, checked: mode.id === initial.modeId }),
      h(
        'span',
        { class: 'choice__body' },
        h(
          'span',
          { class: 'mode-option__head' },
          h('span', { class: 'choice__title' }, mode.name),
          h('span', { class: 'stars', 'aria-label': `${mode.stars} de 5 estrelas` }, stars(mode.stars)),
        ),
        h(
          'span',
          { class: 'choice__detail' },
          `${pluralize(mode.maxDraws, 'tirada', 'tiradas')} · ${pluralize(mode.categories.length, 'categoria', 'categorias')}`,
        ),
        h(
          'span',
          { class: 'chips' },
          mode.categories.map((id) => h('span', { class: 'chip', title: categoryTooltip(id) }, categoryName(id))),
        ),
      ),
    );

  const form = h(
    'form',
    { class: 'start-form', onSubmit: handleSubmit },
    h(
      'fieldset',
      { class: 'panel' },
      h('legend', {}, 'Tipo de partida'),
      h('div', { class: 'choice-row' }, MATCH_TYPES.map(matchTypeOption)),
    ),
    h(
      'fieldset',
      { class: 'panel' },
      h('legend', {}, 'Jogadores'),
      h('div', { class: 'field-row' }, nameField(0), nameField(1)),
    ),
    h(
      'fieldset',
      { class: 'panel' },
      h('legend', {}, 'Modo de jogo'),
      h('div', { class: 'mode-grid' }, MODES.map(modeOption)),
    ),
    h(
      'fieldset',
      { class: 'panel' },
      h('legend', {}, 'Opções'),
      h(
        'label',
        { class: 'switch' },
        h('input', { type: 'checkbox', name: 'timer', checked: Boolean(initial.timerEnabled) }),
        h('span', { class: 'switch__track', 'aria-hidden': 'true' }),
        h('span', {}, 'Timer de 45 s por turno'),
      ),
    ),
    h('button', { type: 'submit', class: 'btn btn--primary btn--large' }, 'Jogar'),
  );

  function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(form);
    const chosenNames = [0, 1].map((i) => {
      const value = String(data.get(`name${i}`) ?? '').trim().slice(0, NAME_MAX_LENGTH);
      return value || DEFAULT_NAMES[i];
    });
    onPlay({
      matchType: String(data.get('matchType') ?? 'local'),
      names: chosenNames,
      modeId: String(data.get('mode') ?? MODES[0].id),
      timerEnabled: data.get('timer') === 'on',
    });
  }

  root.replaceChildren(
    h(
      'div',
      { class: 'screen start-screen' },
      h(
        'header',
        { class: 'start-header' },
        h('h1', { class: 'logo' }, 'Yar!'),
        h('p', { class: 'tagline' }, 'Yahtzee de cartas — 5 cartas, até 4 tiradas, uma categoria por turno.'),
      ),
      form,
    ),
  );
}
