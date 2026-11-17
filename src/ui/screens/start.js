import { NPCS } from '../../ai/index.js';
import { MODES } from '../../core/modes.js';
import { ALISHOW } from '../characters.js';
import { h } from '../dom.js';
import { categoryName, pluralize, stars } from '../texts.js';

export const NAME_MAX_LENGTH = 16;
export const DEFAULT_NAMES = ['Jogador 1', 'Jogador 2'];

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Ícone de traço simples (24×24). `shapes` = [[tag, atributos], …]. */
function icon(shapes) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  for (const [tag, attrs] of shapes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

const ICONS = {
  twoPlayers: () =>
    icon([
      ['circle', { cx: 9, cy: 8, r: 3.2 }],
      ['path', { d: 'M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5' }],
      ['circle', { cx: 16.5, cy: 9, r: 2.6 }],
      ['path', { d: 'M15.6 14.2c2.4-.2 4.3 1.4 4.9 4.8' }],
    ]),
  globe: () =>
    icon([
      ['circle', { cx: 12, cy: 12, r: 8.5 }],
      ['path', { d: 'M3.5 12h17' }],
      ['path', { d: 'M12 3.5c2.6 2.4 3.8 5.4 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.4-3.8-8.5s1.2-6.1 3.8-8.5z' }],
    ]),
};

/** Tipos de partida: mesma estrutura (mídia, título, descrição de 1 linha). */
const MATCH_TYPES = [
  {
    id: 'local',
    title: '2 jogadores',
    description: 'No mesmo computador',
    media: () => h('span', { class: 'option__media option__media--icon' }, ICONS.twoPlayers()),
    enabled: true,
  },
  {
    id: 'npc',
    title: 'Contra a máquina',
    description: `Desafie o ${ALISHOW.name}`,
    media: () =>
      h(
        'span',
        { class: 'option__media' },
        h('img', { class: 'option__portrait', src: ALISHOW.images.neutral, alt: '', draggable: 'false' }),
      ),
    enabled: true,
  },
  {
    id: 'online',
    title: 'Online',
    description: 'Contra um amigo',
    media: () => h('span', { class: 'option__media option__media--icon' }, ICONS.globe()),
    enabled: false,
  },
];

function cleanName(value) {
  return String(value ?? '').trim().slice(0, NAME_MAX_LENGTH);
}

let idCounter = 0;
const uid = (prefix) => `${prefix}-${++idCounter}`;

/**
 * Tela de início.
 * onPlay({ matchType: 'local' | 'npc', names, playerName, npcLevel, modeId, timerEnabled })
 */
export function showStart(root, { initial, onPlay }) {
  const names = initial.names ?? DEFAULT_NAMES;
  const initialType = MATCH_TYPES.some((t) => t.id === initial.matchType && t.enabled)
    ? initial.matchType
    : 'local';

  /** Seção com título normal acima do bloco. */
  const section = (title, body, { matchType, id = uid('sec') } = {}) =>
    h(
      'section',
      { class: 'form-section', dataset: matchType ? { matchType } : undefined, 'aria-labelledby': id },
      h('h2', { class: 'section-title', id }, title),
      body(id),
    );

  const radioOption = ({ name, value, checked, disabled = false, extraClass = '', onChange }, ...content) =>
    h(
      'label',
      { class: `option${disabled ? ' option--disabled' : ''}${extraClass ? ` ${extraClass}` : ''}` },
      h('input', { type: 'radio', name, value, checked, disabled, onChange }),
      h('span', { class: 'option__body' }, ...content),
    );

  const matchTypeOption = (type) =>
    radioOption(
      {
        name: 'matchType',
        value: type.id,
        checked: type.id === initialType,
        disabled: !type.enabled,
        onChange: updateForm,
      },
      type.media(),
      h(
        'span',
        { class: 'option__text' },
        h('span', { class: 'option__title' }, type.title),
        h('span', { class: 'option__desc' }, type.description),
      ),
      !type.enabled && h('span', { class: 'badge badge--soon' }, 'Em breve'),
    );

  const levelOption = (npc) => {
    const level = ALISHOW.levels[npc.id];
    return radioOption(
      {
        name: 'npcLevel',
        value: npc.id,
        checked: npc.id === (initial.npcLevel ?? 'easy'),
        extraClass: 'option--level',
      },
      h(
        'span',
        { class: 'option__text' },
        h('span', { class: 'option__kicker' }, ALISHOW.name),
        h('span', { class: 'option__title' }, level.title),
        h('span', { class: 'option__desc' }, level.description),
      ),
      h('span', { class: `badge badge--level badge--${npc.id}` }, level.badge),
    );
  };

  const nameField = (label, name, value) =>
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, label),
      h('input', {
        type: 'text',
        name,
        value,
        maxlength: NAME_MAX_LENGTH,
        autocomplete: 'off',
        placeholder: 'Digite seu nome',
        required: true,
        onInput: updateForm,
      }),
    );

  const modeOption = (mode) =>
    radioOption(
      { name: 'mode', value: mode.id, checked: mode.id === initial.modeId, extraClass: 'option--mode' },
      h(
        'span',
        { class: 'option__text' },
        h(
          'span',
          { class: 'option__head' },
          h('span', { class: 'option__title' }, mode.name),
          h('span', { class: 'stars', 'aria-label': `${mode.stars} de 5 estrelas` }, stars(mode.stars)),
        ),
        h(
          'span',
          { class: 'option__desc' },
          `${pluralize(mode.maxDraws, 'tirada', 'tiradas')} · ${pluralize(mode.categories.length, 'categoria', 'categorias')}`,
        ),
        h(
          'span',
          { class: 'chips' },
          mode.categories.map((id) => h('span', { class: 'chip' }, categoryName(id))),
        ),
      ),
    );

  const playButton = h('button', { type: 'submit', class: 'btn btn--primary btn--xl' }, 'Jogar');
  const playHint = h('p', { class: 'form-hint', 'aria-live': 'polite' });

  const form = h(
    'form',
    { class: 'start-form', onSubmit: handleSubmit, novalidate: true },
    section('Tipo de partida', (id) =>
      h('div', { class: 'option-grid option-grid--match', role: 'radiogroup', 'aria-labelledby': id }, MATCH_TYPES.map(matchTypeOption)),
    ),
    section(
      'Contra a máquina',
      (id) =>
        h(
          'div',
          { class: 'panel stack' },
          nameField('Seu nome', 'playerName', initial.playerName ?? ''),
          h('p', { class: 'subsection-title', id: `${id}-level` }, `Modo do ${ALISHOW.name}`),
          h(
            'div',
            { class: 'option-grid option-grid--levels', role: 'radiogroup', 'aria-labelledby': `${id}-level` },
            NPCS.map(levelOption),
          ),
          h('p', { class: 'muted small' }, 'Quem começa é sorteado.'),
        ),
      { matchType: 'npc' },
    ),
    section(
      'Jogadores',
      () =>
        h(
          'div',
          { class: 'panel field-row' },
          nameField('Jogador 1', 'name0', names[0] ?? DEFAULT_NAMES[0]),
          nameField('Jogador 2', 'name1', names[1] ?? DEFAULT_NAMES[1]),
        ),
      { matchType: 'local' },
    ),
    section('Modo de jogo', (id) =>
      h('div', { class: 'option-grid option-grid--modes', role: 'radiogroup', 'aria-labelledby': id }, MODES.map(modeOption)),
    ),
    section('Opções', () =>
      h(
        'div',
        { class: 'panel' },
        h(
          'label',
          { class: 'switch' },
          h('input', { type: 'checkbox', name: 'timer', checked: Boolean(initial.timerEnabled) }),
          h('span', { class: 'switch__track', 'aria-hidden': 'true' }),
          h(
            'span',
            { class: 'switch__label' },
            'Timer de 45 s por turno',
            h('span', { class: 'muted', dataset: { matchType: 'npc' } }, ' (só para você)'),
          ),
        ),
      ),
    ),
    h('div', { class: 'form-actions' }, playButton, playHint),
  );

  function currentType() {
    return String(new FormData(form).get('matchType') ?? 'local');
  }

  /** Mostra os campos do tipo escolhido e habilita "Jogar" só com nome(s). */
  function updateForm() {
    const type = currentType();
    for (const el of form.querySelectorAll('[data-match-type]')) {
      el.hidden = el.dataset.matchType !== type;
    }
    const visibleNames = [...form.querySelectorAll('input[type=text]')].filter(
      (input) => !input.closest('[hidden]'),
    );
    const missing = visibleNames.some((input) => cleanName(input.value) === '');
    playButton.disabled = missing;
    playHint.textContent = missing ? (type === 'npc' ? 'Digite seu nome para jogar.' : 'Digite os nomes para jogar.') : '';
  }

  function handleSubmit(event) {
    event.preventDefault();
    updateForm();
    if (playButton.disabled) return;
    const data = new FormData(form);
    onPlay({
      matchType: currentType(),
      names: [0, 1].map((i) => cleanName(data.get(`name${i}`)) || DEFAULT_NAMES[i]),
      playerName: cleanName(data.get('playerName')),
      npcLevel: String(data.get('npcLevel') ?? 'easy'),
      modeId: String(data.get('mode') ?? MODES[0].id),
      timerEnabled: data.get('timer') === 'on',
    });
  }

  updateForm();
  root.replaceChildren(
    h(
      'div',
      { class: 'screen start-screen' },
      h(
        'header',
        { class: 'start-header' },
        h('h1', { class: 'logo' }, 'Yar!'),
        h('p', { class: 'tagline' }, 'Yahtzee de cartas: 5 cartas, até 4 tiradas, uma categoria por turno.'),
      ),
      form,
    ),
  );
}
