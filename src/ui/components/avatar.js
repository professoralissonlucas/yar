/**
 * Avatar genérico de personagem: figura (poses com fade) + balão de fala.
 * Funciona com qualquer personagem de src/ui/characters.js.
 *
 * - Pose base (ex.: neutral, ou thinking durante a vez do dono).
 * - Reação temporária: mostra a pose da reação e uma frase por
 *   CHARACTER_TIMING.reactionMs e volta para a pose base.
 *
 * `figure` e `speech` são elementos separados para o layout posicioná-los.
 */

import { CHARACTER_TIMING, pickLine, poseForReaction, poseImageStyle } from '../characters.js';
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

/**
 * @param {object} character
 * @param {{ pose?: string, caption?: boolean, holdSpeech?: boolean, rng?: () => number, timing?: object }} options
 *   holdSpeech: o balão não some sozinho (tela de fim de jogo).
 */
export function createAvatar(
  character,
  { pose = 'neutral', caption = true, holdSpeech = false, rng = Math.random, timing = CHARACTER_TIMING } = {},
) {
  let basePose = poseForReaction(character, pose);
  let currentPose = null;
  let lastLine = null;
  let reactionTimer = null;
  let speechTimer = null;
  let baseLineWhenFree = null;
  let destroyed = false;

  const stack = h('div', { class: 'avatar__stack' });
  const figure = h(
    'figure',
    { class: 'avatar', dataset: { character: character.id }, style: { '--avatar-fade': `${timing.fadeMs}ms` } },
    h('div', { class: 'avatar__frame' }, stack),
    caption && h('figcaption', { class: 'avatar__name' }, character.name),
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
    // enquadramento da pose (characters.js → framing): mesma cabeça em todas
    const frame = poseImageStyle(character, next);
    img.style.width = frame.width;
    img.style.left = frame.left;
    img.style.top = frame.top;

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

  function animate(posed) {
    figure.classList.remove('avatar--hop', 'avatar--shake');
    const cls = ANIMATION_BY_POSE[posed];
    if (!cls) return;
    void figure.offsetWidth; // reinicia a animação se a mesma pose se repetir
    figure.classList.add(cls);
  }

  /** Mostra uma frase da lista `lineKey` (some depois de reactionMs). */
  function say(lineKey) {
    const line = pickLine(character, lineKey, lastLine, rng);
    if (!line) return;
    lastLine = line;
    speechText.textContent = line;
    speech.classList.add('is-visible');
    figure.dataset.speaking = 'true';
    clearTimeout(speechTimer);
    if (holdSpeech) return;
    speechTimer = setTimeout(() => {
      speech.classList.remove('is-visible');
      delete figure.dataset.speaking;
    }, timing.reactionMs);
  }

  /**
   * Reação temporária (ex.: 'happy', 'taunt', 'greeting'); volta para a pose
   * base depois de reactionMs. `lineKey` troca a lista de frases (padrão: a reação).
   */
  function react(reaction, { lineKey = reaction } = {}) {
    if (destroyed || !reaction) return;
    clearTimeout(reactionTimer);
    const posed = poseForReaction(character, reaction);
    showPose(posed);
    animate(posed);
    say(lineKey);
    reactionTimer = setTimeout(() => {
      reactionTimer = null;
      if (destroyed) return;
      showPose(basePose);
      animate(basePose);
      if (baseLineWhenFree) say(baseLineWhenFree);
      baseLineWhenFree = null;
    }, timing.reactionMs);
  }

  /**
   * Muda a pose base (reação "permanente", ex.: 'thinking' ou 'victory').
   * Se houver reação em andamento, vale quando ela acabar.
   */
  function setBase(reaction, { say: speak = false } = {}) {
    if (destroyed) return;
    basePose = poseForReaction(character, reaction);
    if (reactionTimer) {
      baseLineWhenFree = speak ? reaction : null;
      return;
    }
    showPose(basePose);
    animate(basePose);
    if (speak) say(reaction);
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
