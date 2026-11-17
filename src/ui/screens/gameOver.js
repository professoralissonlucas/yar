import { getWinners } from '../../core/game.js';
import { getMode } from '../../core/modes.js';
import { renderScoreboard } from '../components/scoreboard.js';
import { h } from '../dom.js';
import { pluralize, stars } from '../texts.js';

/** Tela de fim de jogo: placar final, vencedor ou empate. */
export function showGameOver(root, { state, onPlayAgain, onHome }) {
  const { winnerIds, isTie, totals } = getWinners(state);
  const mode = getMode(state.modeId);
  const nameOf = (id) => state.players.find((p) => p.id === id).name;
  const ranking = [...state.players].sort((a, b) => totals[b.id] - totals[a.id]);

  root.replaceChildren(
    h(
      'div',
      { class: 'screen gameover-screen' },
      h(
        'header',
        { class: 'gameover-header' },
        h('p', { class: 'gameover-header__kicker' }, 'Fim de jogo'),
        h('h1', { class: 'gameover-header__title' }, isTie ? 'Empate!' : `${nameOf(winnerIds[0])} venceu!`),
        h('p', { class: 'gameover-header__mode' }, `${mode.name} `, h('span', { class: 'stars' }, stars(mode.stars))),
      ),
      h(
        'ol',
        { class: 'ranking' },
        ranking.map((p) =>
          h(
            'li',
            { class: winnerIds.includes(p.id) ? 'ranking__item is-winner' : 'ranking__item' },
            h('span', { class: 'ranking__name' }, p.name),
            h('span', { class: 'ranking__total' }, pluralize(totals[p.id], 'ponto', 'pontos')),
          ),
        ),
      ),
      h('section', { class: 'panel score-panel', 'aria-label': 'Placar final' }, renderScoreboard({ state })),
      h(
        'div',
        { class: 'gameover-actions' },
        h('button', { type: 'button', class: 'btn btn--primary btn--large', onClick: onPlayAgain }, 'Jogar de novo'),
        h('button', { type: 'button', class: 'btn btn--ghost btn--large', onClick: onHome }, 'Voltar ao início'),
      ),
    ),
  );
  window.scrollTo(0, 0);
}
