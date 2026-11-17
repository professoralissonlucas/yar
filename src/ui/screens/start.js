import { NPCS } from '../../ai/index.js';
import { MODES } from '../../core/modes.js';
import { getCharacter } from '../characters.js';
import { h } from '../dom.js';
import { NPC_DESCRIPTIONS, categoryName, categoryTooltip, pluralize, stars } from '../texts.js';

export const NAME_MAX_LENGTH = 16;
export const DEFAULT_NAMES = ['Jogador 1', 'Jogador 2'];
export const DEFAULT_PLAYER_NAME = 'Você';

/** Tipos de partida. Os desabilitados aparecem como "em breve". */
const MATCH_TYPES = [
  { id: 'local', label: '2 jogadores', detail: 'no mesmo computador', enabled: true },
  {
    id: 'npc',
    label: 'Contra a máquina',
    detail: 'Igor, Eileen ou Islin',
    enabled: true,
    character: 'alishow', // você joga como o Prof. Alishow
  },
  { id: 'online', label: 'Online', detail: 'contra um amigo', enabled: false },
];

function cleanName(value, fallback) {
  return String(value ?? '').trim().slice(0, NAME_MAX_LENGTH) || fallback;
}

/**
 * Tela de início.
 * onPlay({ matchType: 'local' | 'npc', names, playerName, npcLevel, modeId, timerEnabled })
 */
export function showStart(root, { initial, onPlay }) {
  const names = initial.names ?? DEFAULT_NAMES;
  const initialType = MATCH_TYPES.some((t) => t.id === initial.matchType && t.enabled)
    ? initial.matchType
    : 'local';

  const characterThumb = (id) => {
    const character = getCharacter(id);
    return h(
      'span',
      { class: 'choice__character' },
      h('img', { src: character.images.neutral, alt: '', draggable: 'false' }),
      h('span', { class: 'choice__character-name' }, `Você é o ${character.name}`),
    );
  };

  const matchTypeOption = (type) =>
    h(
      'label',
      { class: `choice${type.enabled ? '' : ' choice--disabled'}${type.character ? ' choice--with-character' : ''}` },
      h('input', {
        type: 'radio',
        name: 'matchType',
        value: type.id,
        checked: type.id === initialType,
        disabled: !type.enabled,
        onChange: updateVisibleSections,
      }),
      h(
        'span',
        { class: 'choice__body' },
        h('span', { class: 'choice__title' }, type.label),
        h('span', { class: 'choice__detail' }, type.detail),
        !type.enabled && h('span', { class: 'badge' }, 'em breve'),
        type.character && characterThumb(type.character),
      ),
    );

  const textField = (label, name, value, placeholder) =>
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
        placeholder,
      }),
    );

  const npcOption = (npc) =>
    h(
      'label',
      { class: 'choice npc-option' },
      h('input', {
        type: 'radio',
        name: 'npcLevel',
        value: npc.id,
        checked: npc.id === (initial.npcLevel ?? 'easy'),
      }),
      h(
        'span',
        { class: 'choice__body' },
        h(
          'span',
          { class: 'mode-option__head' },
          h('span', { class: 'choice__title' }, npc.name),
          h('span', { class: 'badge' }, npc.label),
        ),
        h('span', { class: 'choice__detail' }, NPC_DESCRIPTIONS[npc.id]),
      ),
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
      { class: 'panel', dataset: { matchType: 'local' } },
      h('legend', {}, 'Jogadores'),
      h(
        'div',
        { class: 'field-row' },
        textField('Jogador 1', 'name0', names[0] ?? DEFAULT_NAMES[0], DEFAULT_NAMES[0]),
        textField('Jogador 2', 'name1', names[1] ?? DEFAULT_NAMES[1], DEFAULT_NAMES[1]),
      ),
    ),
    h(
      'fieldset',
      { class: 'panel', dataset: { matchType: 'npc' } },
      h('legend', {}, 'Contra a máquina'),
      h(
        'div',
        { class: 'field-row' },
        textField('Seu nome', 'playerName', initial.playerName ?? '', DEFAULT_PLAYER_NAME),
      ),
      h('div', { class: 'choice-row npc-row' }, NPCS.map(npcOption)),
      h('p', { class: 'form-note' }, 'Quem começa é sorteado.'),
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
        h(
          'span',
          {},
          'Timer de 45 s por turno',
          h('span', { class: 'switch__note', dataset: { matchType: 'npc' } }, ' (só para você)'),
        ),
      ),
    ),
    h('button', { type: 'submit', class: 'btn btn--primary btn--large' }, 'Jogar'),
  );

  function currentType() {
    return String(new FormData(form).get('matchType') ?? 'local');
  }

  function updateVisibleSections() {
    const type = currentType();
    for (const el of form.querySelectorAll('[data-match-type]')) {
      el.hidden = el.dataset.matchType !== type;
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(form);
    onPlay({
      matchType: currentType(),
      names: [0, 1].map((i) => cleanName(data.get(`name${i}`), DEFAULT_NAMES[i])),
      playerName: cleanName(data.get('playerName'), DEFAULT_PLAYER_NAME),
      npcLevel: String(data.get('npcLevel') ?? 'easy'),
      modeId: String(data.get('mode') ?? MODES[0].id),
      timerEnabled: data.get('timer') === 'on',
    });
  }

  updateVisibleSections();
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
