/**
 * Personagens (avatares). Sistema genérico: cada personagem tem nome, imagens
 * por pose, ajustes de enquadramento e frases. Hoje só o Prof. Alishow (avatar
 * do jogador humano contra a máquina); os NPCs podem ganhar personagens aqui
 * depois, usando o mesmo componente (src/ui/components/avatar.js).
 *
 * As regras de quando reagir também ficam aqui (REACTION_RULES) e usam só as
 * funções de pontuação do core.
 */

import { FIXED_SCORES, getCategory, scoreHand } from '../core/scoring.js';

export const POSES = ['neutral', 'thinking', 'happy', 'excited', 'annoyed', 'surprised', 'victory', 'defeat'];

// O Vite troca isto por URLs com hash (com o `base` do GitHub Pages).
const alishowFiles = import.meta.glob('../img/*.png', { eager: true, query: '?url', import: 'default' });

function imagesByPose(files) {
  const images = {};
  for (const [path, url] of Object.entries(files)) {
    const pose = path.split('/').pop().replace(/\.png$/, '');
    if (POSES.includes(pose)) images[pose] = url;
  }
  return images;
}

/** Tempo das reações (ms). */
export const CHARACTER_TIMING = {
  reactionMs: 2500, // volta para a pose base depois disto
  fadeMs: 150, // troca de pose
};

/** Quando o personagem reage (do ponto de vista do jogador dono do personagem). */
export const REACTION_RULES = {
  /** Marcar estas categorias deixa feliz. */
  happyCategories: ['two_pair', 'small_straight'],
  /** Marcar estas categorias deixa empolgado. */
  excitedCategories: ['yar', 'large_straight', 'full_house'],
  /** Categorias de pontos variáveis: feliz a partir desta fração do máximo. */
  happyRatio: 0.6,
  /** Tirada que forma uma destas categorias (antes de marcar) empolga. */
  excitedDrawCategories: ['yar', 'large_straight'],
  /** O adversário marcar isto ou mais surpreende. */
  surprisedMinPoints: 25,
  /** O adversário fazer qualquer uma destas surpreende. */
  surprisedCategories: ['yar'],
};

export const ALISHOW = {
  id: 'alishow',
  name: 'Prof. Alishow',
  images: imagesByPose(alishowFiles),
  /**
   * Ajuste de enquadramento por pose (zoom ancorado no topo). O thinking.png é
   * corpo inteiro e os outros cortam nas coxas; o zoom deixa a cabeça do mesmo
   * tamanho. Remova se a imagem for refeita no mesmo enquadramento.
   */
  framing: {
    thinking: { scale: 1.5 },
  },
  /** Frases por pose — edite à vontade. Pose sem frases não mostra balão. */
  lines: {
    neutral: [],
    thinking: [
      'Hmm, vamos ver o que vem aí...',
      'Calculando as chances...',
      'Deixa eu fazer as contas...',
    ],
    happy: [
      'Isso é matemática pura!',
      'Probabilidade a meu favor!',
      'Anotem isso no caderno.',
      'Exatamente como na lousa.',
    ],
    excited: [
      'YAR! Nota dez!',
      'Isso cai na prova!',
      'Que sequência linda!',
      'Ponto extra pra mim!',
    ],
    annoyed: [
      'Zero... sem direito a recuperação.',
      'Isso não estava no plano de aula.',
      'Vou fingir que isso não aconteceu.',
    ],
    surprised: [
      'Ei! Quem te ensinou isso?',
      'Opa, alguém estudou!',
      'Isso não estava na ementa!',
    ],
    victory: ['Aula encerrada. Vitória do professor!', 'E é por isso que eu sou o professor.'],
    defeat: ['Hoje vocês me pegaram. Revanche na próxima aula!', 'Vou rever minhas anotações...'],
  },
};

export const CHARACTERS = { [ALISHOW.id]: ALISHOW };

export function getCharacter(id) {
  const character = CHARACTERS[id];
  if (!character) throw new Error(`Personagem desconhecido: ${id}`);
  return character;
}

// ---------- regras de reação (puras) ----------

/** Reação ao marcar uma categoria: 'annoyed' | 'excited' | 'happy' | null. */
export function reactToOwnScore({ categoryId, points }, rules = REACTION_RULES) {
  if (points === 0) return 'annoyed';
  if (rules.excitedCategories.includes(categoryId)) return 'excited';
  if (rules.happyCategories.includes(categoryId)) return 'happy';
  const isVariable = !(categoryId in FIXED_SCORES);
  if (isVariable && points >= rules.happyRatio * getCategory(categoryId).max) return 'happy';
  return null;
}

/** Reação a uma tirada (antes de marcar): 'excited' | null. */
export function reactToOwnDraw(hand, rules = REACTION_RULES) {
  if (hand.length !== 5) return null;
  const scores = scoreHand(hand);
  return rules.excitedDrawCategories.some((c) => scores[c] > 0) ? 'excited' : null;
}

/** Reação a uma jogada do adversário: 'surprised' | null. */
export function reactToOpponentScore({ categoryId, points }, rules = REACTION_RULES) {
  if (points >= rules.surprisedMinPoints) return 'surprised';
  if (points > 0 && rules.surprisedCategories.includes(categoryId)) return 'surprised';
  return null;
}

/** Pose da tela de fim de jogo (empate = happy). */
export function resultPose({ won, tie }) {
  if (tie) return 'happy';
  return won ? 'victory' : 'defeat';
}

/** Frase sorteada da pose, sem repetir a anterior (quando há alternativa). */
export function pickLine(character, pose, previous, rng = Math.random) {
  const lines = character.lines[pose] ?? [];
  if (lines.length === 0) return null;
  const options = lines.length > 1 ? lines.filter((l) => l !== previous) : lines;
  return options[Math.floor(rng() * options.length)];
}

// ---------- pré-carregamento ----------

const preloaded = new Map();

/** Carrega todas as poses de antemão (evita piscar na 1ª troca). */
export function preloadCharacter(character) {
  if (preloaded.has(character.id) || typeof Image === 'undefined') return;
  const images = Object.values(character.images).map((url) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    return img;
  });
  preloaded.set(character.id, images); // mantém a referência
}
