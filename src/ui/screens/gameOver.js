import { getWinners } from '../../core/game.js';
import { getMode } from '../../core/modes.js';
import { getCharacter, resultReaction } from '../characters.js';
import { createAvatar } from '../components/avatar.js';
import { attachCategoryTips } from '../components/categoryTip.js';
import { renderScoreboard, seatBadge } from '../components/scoreboard.js';
import { h } from '../dom.js';
import { pluralize, stars } from '../texts.js';

/**
 * Tela de fim de jogo: placar final, vencedor ou empate.
 * `seats` (opcional): assentos da partida; quem tiver `character` aparece na
 * pose do resultado (vitória, derrota ou, no empate, feliz) com a frase.
 *
 * Online: `result` substitui getWinners (vitória por abandono, quando o core
 * não terminou), `note` é uma linha extra abaixo do título e `actions` é o
 * elemento com os botões (Revanche / Sair da sala) no lugar dos padrões.
 */
export function showGameOver(root, { state, seats = [], onPlayAgain, onHome, result = null, note = null, actions = null }) {
  const { winnerIds, isTie, totals } = result ?? getWinners(state);
  const mode = getMode(state.modeId);
  const nameOf = (id) => state.players.find((p) => p.id === id).name;
  const ranking = [...state.players].sort((a, b) => totals[b.id] - totals[a.id]);

  const avatarSeat = seats.find((s) => s.character);
  let avatar = null;
  if (avatarSeat) {
    const reaction = resultReaction({ won: winnerIds.includes(avatarSeat.id), tie: isTie });
    avatar = createAvatar(getCharacter(avatarSeat.character), { pose: reaction, caption: false, holdSpeech: true });
    avatar.setBase(reaction, { say: true }); // anima (pulinho na vitória) e fala
  }

  const leave = (action) => () => {
    avatar?.destroy();
    action();
  };

  const screenEl = h(
    'div',
    { class: 'screen gameover-screen' },
    h(
      'header',
      { class: 'gameover-header' },
      h('p', { class: 'kicker' }, 'Fim de jogo'),
      h('h1', { class: 'gameover-header__title' }, isTie ? 'Empate!' : `${nameOf(winnerIds[0])} venceu!`),
      h('p', { class: 'muted' }, `Modo ${mode.name} `, h('span', { class: 'stars' }, stars(mode.stars))),
      note && h('p', { class: 'gameover-header__note' }, note),
    ),
    avatar &&
      h(
        'div',
        { class: 'gameover-avatar' },
        h('div', { class: 'gameover-avatar__figure' }, avatar.figure),
        h('div', { class: 'gameover-avatar__side' }, h('strong', { class: 'seat__name' }, avatarSeat.name), avatar.speech),
      ),
    h(
      'ol',
      { class: 'ranking' },
      ranking.map((p) =>
        h(
          'li',
          { class: winnerIds.includes(p.id) ? 'ranking__item is-winner' : 'ranking__item' },
          seatBadge(
            seats.find((s) => s.id === p.id),
            p.name,
          ),
          h('span', { class: 'ranking__name' }, p.name),
          h('span', { class: 'ranking__total' }, pluralize(totals[p.id], 'ponto', 'pontos')),
        ),
      ),
    ),
    h('section', { class: 'panel score-panel', 'aria-label': 'Placar final' }, renderScoreboard({ state, seats })),
    actions ??
      h(
        'div',
        { class: 'gameover-actions' },
        h('button', { type: 'button', class: 'btn btn--primary btn--xl', onClick: leave(onPlayAgain) }, 'Jogar de novo'),
        h('button', { type: 'button', class: 'btn btn--ghost btn--xl', onClick: leave(onHome) }, 'Voltar ao início'),
      ),
  );
  attachCategoryTips(screenEl); // dica das categorias no placar final (sem a mão)
  root.replaceChildren(screenEl);
  window.scrollTo(0, 0);
}
