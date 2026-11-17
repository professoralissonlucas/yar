/**
 * Avatar genérico de personagem: figura (poses com fade) + balão de fala.
 * Funciona com qualquer personagem de src/ui/characters.js.
 *
 * - Pose base (ex.: neutral, ou thinking durante a vez do adversário).
 * - Reação temporária: mostra a pose e uma frase por CHARACTER_TIMING.reactionMs
 *   e volta para a pose base.
 *
 * `figure` e `speech` são elementos separados para o layout poder posicioná-los
 * (balão acima da cabeça no desktop, faixa no celular).
 */

import { CHARACTER_TIMING, pickLine } from '../characters.js';
import { h } from '../dom.js';

const POSE_LABELS = {
  neutral: 'tranquilo',
  thinking: 'pensando',
  happy: 'feliz',
  excited: 'empolgado',
  annoyed: 'irritado',
  surprised: 'surpreso',
  victory: 'comemorando',
  defeat: 'derrotado',
};

const ANIMATION_BY_POSE = {
  excited: 'avatar--hop',
  victory: 'avatar--hop',
  annoyed: 'avatar--shake',
};

export function createAvatar(character, { pose = 'neutral', rng = Math.random, timing = CHARACTER_TIMING } = {}) {
  let basePose = pose;
  let currentPose = null;
  let lastLine = null;
  let reactionTimer = null;
  let speechTimer = null;
  let sayBaseWhenFree = false;
  let destroyed = false;

  const stack = h('div', { class: 'avatar__stack' });
  const figure = h(
    'figure',
    { class: 'avatar', dataset: { character: character.id }, style: { '--avatar-fade': `${timing.fadeMs}ms` } },
    h('div', { class: 'avatar__frame' }, stack),
    h('figcaption', { class: 'avatar__name' }, character.name),
  );
  const speechText = h('span', { class: 'avatar__speech-text' });
  const speech = h('div', { class: 'avatar__speech', role: 'status', 'aria-live': 'polite' }, speechText);

  /** Troca a imagem com fade: a nova entra por cima e a antiga sai depois. */
  function showPose(next) {
    if (next === currentPose || !character.images[next]) return;
    currentPose = next;
    figure.dataset.pose = next;
    const img = h('img', {
      class: 'avatar__img',
      src: character.images[next],
      alt: `${character.name} ${POSE_LABELS[next] ?? ''}`.trim(),
      draggable: 'false',
    });
    const scale = character.framing?.[next]?.scale;
    if (scale) img.style.setProperty('--avatar-scale', String(scale));

    const previous = [...stack.children];
    stack.append(img);
    if (previous.length === 0) {
      img.classList.add('is-visible');
      return;
    }
    void img.offsetWidth; // garante a transição de opacidade
    img.classList.add('is-visible');
    setTimeout(() => previous.forEach((el) => el.remove()), timing.fadeMs + 30);
  }

  function animate(next) {
    figure.classList.remove('avatar--hop', 'avatar--shake');
    const cls = ANIMATION_BY_POSE[next];
    if (!cls) return;
    void figure.offsetWidth; // reinicia a animação se a mesma pose se repetir
    figure.classList.add(cls);
  }

  function say(forPose) {
    const line = pickLine(character, forPose, lastLine, rng);
    if (!line) return;
    lastLine = line;
    speechText.textContent = line;
    speech.classList.add('is-visible');
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => speech.classList.remove('is-visible'), timing.reactionMs);
  }

  /** Reação temporária; volta para a pose base depois de reactionMs. */
  function react(next) {
    if (destroyed || !next) return;
    clearTimeout(reactionTimer);
    showPose(next);
    animate(next);
    say(next);
    reactionTimer = setTimeout(() => {
      reactionTimer = null;
      if (destroyed) return;
      showPose(basePose);
      animate(basePose);
      if (sayBaseWhenFree) say(basePose);
      sayBaseWhenFree = false;
    }, timing.reactionMs);
  }

  /** Muda a pose base. Se houver reação em andamento, vale quando ela acabar. */
  function setBase(next, { say: speak = false } = {}) {
    if (destroyed) return;
    basePose = next;
    if (reactionTimer) {
      sayBaseWhenFree = speak;
      return;
    }
    showPose(next);
    animate(next);
    if (speak) say(next);
  }

  function destroy() {
    destroyed = true;
    clearTimeout(reactionTimer);
    clearTimeout(speechTimer);
  }

  showPose(basePose);
  return {
    figure,
    speech,
    react,
    setBase,
    destroy,
    get pose() {
      return currentPose;
    },
  };
}
