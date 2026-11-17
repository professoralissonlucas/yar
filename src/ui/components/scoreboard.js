import { getCurrentPlayer, getScoreOptions, getTotals } from '../../core/game.js';
import { faceStyle, getCharacter } from '../characters.js';
import { h } from '../dom.js';
import { categoryDescription, categoryName, initialOf } from '../texts.js';

const FACE_PX = 32;

let renderCount = 0;

/** Selo do jogador no cabeçalho: rosto do personagem ou inicial num círculo. */
export function seatBadge(seat, name) {
  if (seat?.character) {
    return h('span', {
      class: 'seat-face',
      style: faceStyle(getCharacter(seat.character), FACE_PX),
      'aria-hidden': 'true',
    });
  }
  return h('span', { class: 'seat-initial', 'aria-hidden': 'true' }, initialOf(name));
}

/**
 * Tabela de pontuação: uma linha por categoria do modo, uma coluna por jogador.
 * - `seats`: assentos (para o rosto do personagem / inicial no cabeçalho).
 * - `interactive`: as células vazias do jogador da vez mostram a prévia dos
 *   pontos (getScoreOptions) e chamam onScore(categoryId) ao clicar.
 * - `showPreview`: mostra a prévia só para leitura (vez do NPC).
 * - `highlight`: categoria do jogador da vez a destacar (escolha do NPC).
 * - `handPoints`: pontos da mão atual por categoria (dica "Sua mão agora"), ou null.
 *
 * O nome de cada categoria é um botão com a dica (components/categoryTip.js);
 * o texto da dica para leitores de tela fica fora da tabela, escondido, e é
 * ligado ao botão por aria-describedby. Devolve um fragmento: tabela + textos.
 */
export function renderScoreboard({
  state,
  seats = [],
  interactive = false,
  showPreview = false,
  highlight = null,
  handPoints = null,
  onScore,
}) {
  const idPrefix = `cat-desc-${++renderCount}`;
  const playing = state.status === 'playing';
  const current = getCurrentPlayer(state);
  const options = interactive || showPreview ? getScoreOptions(state) : {};
  const totals = getTotals(state);
  const last = state.lastScored;

  const headCell = (player) =>
    h(
      'th',
      { scope: 'col', class: playing && player.id === current.id ? 'is-current' : null },
      h(
        'span',
        { class: 'scoreboard__head' },
        seatBadge(
          seats.find((s) => s.id === player.id),
          player.name,
        ),
        h('span', { class: 'scoreboard__player', title: player.name }, player.name),
      ),
    );

  const cell = (player, categoryId) => {
    const value = state.scores[player.id][categoryId];
    const isCurrent = playing && player.id === current.id;
    const classes = [isCurrent && 'is-current'];

    if (value !== null) {
      const justScored = last && last.playerId === player.id && last.categoryId === categoryId;
      classes.push('cell--filled', value === 0 && 'cell--zero', justScored && 'cell--just-scored');
      return h('td', { class: classes.filter(Boolean).join(' ') }, value);
    }

    if (isCurrent && categoryId in options) {
      const points = options[categoryId];
      if (!interactive) {
        const picked = highlight === categoryId;
        return h(
          'td',
          { class: [...classes, picked && 'cell--npc-pick'].filter(Boolean).join(' ') },
          h(
            'span',
            { class: `preview preview--readonly${points === 0 ? ' preview--zero' : ''}` },
            points,
          ),
        );
      }
      return h(
        'td',
        { class: classes.filter(Boolean).join(' ') },
        h(
          'button',
          {
            type: 'button',
            class: points === 0 ? 'preview preview--zero' : 'preview',
            onClick: () => onScore?.(categoryId),
            'aria-label':
              points === 0
                ? `Zerar ${categoryName(categoryId)}`
                : `Marcar ${points} pontos em ${categoryName(categoryId)}`,
            dataset: { focusKey: `score-${categoryId}` },
          },
          points,
        ),
      );
    }

    classes.push('cell--empty');
    return h('td', { class: classes.filter(Boolean).join(' ') });
  };

  const table = h(
    'table',
    // --rows: categorias + total + cabeçalho (rosto e nome, ~2 linhas) + folga
    { class: 'scoreboard', style: { '--rows': String(state.categories.length + 4) } },
    h(
      'thead',
      {},
      h('tr', {}, h('th', { scope: 'col', class: 'scoreboard__cat' }, 'Categoria'), state.players.map(headCell)),
    ),
    h(
      'tbody',
      {},
      state.categories.map((categoryId) =>
        h(
          'tr',
          {},
          h(
            'th',
            { scope: 'row', class: 'scoreboard__cat' },
            h(
              'button',
              {
                type: 'button',
                class: 'cat-name',
                'aria-describedby': `${idPrefix}-${categoryId}`,
                dataset: { catTip: categoryId, focusKey: `cat-${categoryId}` },
              },
              h('span', { class: 'cat-name__text' }, categoryName(categoryId)),
              h('span', { class: 'cat-name__info', 'aria-hidden': 'true' }, 'i'),
            ),
          ),
          state.players.map((p) => cell(p, categoryId)),
        ),
      ),
    ),
    h(
      'tfoot',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'row', class: 'scoreboard__cat' }, 'Total'),
        state.players.map((p) =>
          h('td', { class: playing && p.id === current.id ? 'is-current' : null }, totals[p.id]),
        ),
      ),
    ),
  );

  const descriptions = h(
    'div',
    { class: 'visually-hidden' },
    state.categories.map((categoryId) =>
      h(
        'span',
        { id: `${idPrefix}-${categoryId}` },
        categoryDescription(categoryId, typeof handPoints?.[categoryId] === 'number' ? handPoints[categoryId] : null),
      ),
    ),
  );
  const fragment = document.createDocumentFragment();
  fragment.append(table, descriptions);
  return fragment;
}
