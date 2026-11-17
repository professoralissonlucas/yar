/**
 * Personagens (avatares). Sistema genérico: cada personagem tem nome, imagens
 * por pose, ajustes de enquadramento, recorte do rosto, frases por reação e
 * (opcional) níveis. Hoje há um só: o Prof. Alishow, que É a máquina.
 *
 * Reação ≠ pose: uma reação (ex.: 'taunt') escolhe uma pose (ex.: 'happy') e
 * um conjunto de frases. As regras de quando reagir ficam aqui e usam só as
 * funções de pontuação do core. Tudo do ponto de vista do DONO do personagem.
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

/** Quando o personagem reage (do ponto de vista do dono do personagem). */
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
  /**
   * Recorte do rosto na pose neutral (miniatura da tabela), em frações da
   * imagem: centro (x, y) e lado do quadrado (size, fração da largura).
   */
  face: { x: 0.51, y: 0.15, size: 0.3 },
  /** Modos do professor (um por nível de IA de src/ai/). */
  levels: {
    easy: { title: 'Bonzinho', badge: 'Fácil', description: 'Dá umas colher de chá.' },
    medium: { title: 'Exigente', badge: 'Médio', description: 'Joga com estratégia.' },
    hard: { title: 'Banca de Prova', badge: 'Difícil', description: 'Calcula cada probabilidade.' },
  },
  /** Pose de cada reação que não tem pose com o mesmo nome. */
  reactionPoses: {
    taunt: 'happy',
    tie: 'happy',
    greeting: 'neutral',
  },
  /** Frases por reação — edite à vontade. Reação sem frases não mostra balão. */
  lines: {
    neutral: [],
    thinking: ['Deixa eu fazer as contas...', 'Calculando as chances...'],
    happy: ['Isso é matemática pura!', 'Probabilidade a meu favor!'],
    excited: ['YAR! Nota dez pra mim!', 'Isso cai na prova!'],
    annoyed: ['Zero... sem direito a recuperação.', 'Isso não estava no plano de aula.'],
    surprised: ['Ei! Quem te ensinou isso?', 'Opa, alguém estudou!'],
    taunt: ['Zerou? Recuperação pra você!', 'Faltou estudar, hein?'],
    victory: ['Aula encerrada. Vitória do professor!'],
    defeat: ['Aprovado com louvor! Revanche na próxima aula.'],
    tie: ['Empate! Ninguém reprovou hoje.'],
    greeting_easy: ['Vou pegar leve, prometo.'],
    greeting_medium: ['Vamos ver se você fez a lição.'],
    greeting_hard: ['Espero que tenha estudado.'],
  },
};

export const CHARACTERS = { [ALISHOW.id]: ALISHOW };

export function getCharacter(id) {
  const character = CHARACTERS[id];
  if (!character) throw new Error(`Personagem desconhecido: ${id}`);
  return character;
}

/** Pose usada por uma reação. */
export function poseForReaction(character, reaction) {
  return character.reactionPoses?.[reaction] ?? reaction;
}

// ---------- regras de reação (puras) ----------

/** O dono do personagem marcou: 'annoyed' | 'excited' | 'happy' | null. */
export function reactToOwnScore({ categoryId, points }, rules = REACTION_RULES) {
  if (points === 0) return 'annoyed';
  if (rules.excitedCategories.includes(categoryId)) return 'excited';
  if (rules.happyCategories.includes(categoryId)) return 'happy';
  const isVariable = !(categoryId in FIXED_SCORES);
  if (isVariable && points >= rules.happyRatio * getCategory(categoryId).max) return 'happy';
  return null;
}

/** O dono do personagem tirou cartas (antes de marcar): 'excited' | null. */
export function reactToOwnDraw(hand, rules = REACTION_RULES) {
  if (hand.length !== 5) return null;
  const scores = scoreHand(hand);
  return rules.excitedDrawCategories.some((c) => scores[c] > 0) ? 'excited' : null;
}

/** O adversário marcou: 'taunt' (zerou) | 'surprised' | null. */
export function reactToOpponentScore({ categoryId, points }, rules = REACTION_RULES) {
  if (points === 0) return 'taunt';
  if (points >= rules.surprisedMinPoints) return 'surprised';
  if (rules.surprisedCategories.includes(categoryId)) return 'surprised';
  return null;
}

/** Reação ao resultado da partida: 'victory' | 'defeat' | 'tie'. */
export function resultReaction({ won, tie }) {
  if (tie) return 'tie';
  return won ? 'victory' : 'defeat';
}

/** Frase sorteada da reação, sem repetir a anterior (quando há alternativa). */
export function pickLine(character, lineKey, previous, rng = Math.random) {
  const lines = character.lines[lineKey] ?? [];
  if (lines.length === 0) return null;
  const options = lines.length > 1 ? lines.filter((l) => l !== previous) : lines;
  return options[Math.floor(rng() * options.length)];
}

// ---------- miniaturas ----------

/** Estilo (background) para mostrar só o rosto num quadrado de `sizePx`. */
export function faceStyle(character, sizePx) {
  const { x, y, size } = character.face;
  const bgWidth = sizePx / size; // largura da imagem inteira, em px
  const bgHeight = (bgWidth * 578) / 432;
  return {
    backgroundImage: `url("${character.images.neutral}")`,
    backgroundSize: `${bgWidth}px ${bgHeight}px`,
    backgroundPosition: `${sizePx / 2 - x * bgWidth}px ${sizePx / 2 - y * bgHeight}px`,
  };
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
