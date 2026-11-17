/** Modos de jogo (inspirados nos modos PvP do Yar). Edite aqui para ajustar. */

const NUMBERS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const COMBOS = [
  'pair',
  'three_kind',
  'four_kind',
  'two_pair',
  'full_house',
  'yar',
  'small_straight',
  'large_straight',
  'chance',
];

export const MODES = [
  { id: 'basic', name: 'Básico', stars: 1, maxDraws: 3, categories: [...NUMBERS] },
  {
    id: 'odd',
    name: 'Ímpares',
    stars: 2,
    maxDraws: 3,
    categories: ['ones', 'threes', 'fives', 'pair', 'three_kind', 'chance'],
  },
  {
    id: 'even',
    name: 'Pares',
    stars: 2,
    maxDraws: 3,
    categories: ['twos', 'fours', 'sixes', 'pair', 'three_kind', 'chance'],
  },
  {
    id: 'pairs',
    name: 'Duplas',
    stars: 3,
    maxDraws: 3,
    categories: [...NUMBERS, 'two_pair', 'full_house'],
  },
  {
    id: 'low',
    name: 'Baixinhos',
    stars: 3,
    maxDraws: 3,
    categories: ['ones', 'twos', 'threes', 'pair', 'two_pair', 'chance'],
  },
  {
    id: 'sequence',
    name: 'Sequências',
    stars: 4,
    maxDraws: 4,
    categories: [...NUMBERS, 'small_straight', 'large_straight'],
  },
  { id: 'no_numbers', name: 'Sem números', stars: 4, maxDraws: 4, categories: [...COMBOS] },
  { id: 'full', name: 'Completo', stars: 5, maxDraws: 4, categories: [...NUMBERS, ...COMBOS] },
];

const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m]));

export function getMode(id) {
  const mode = MODE_BY_ID[id];
  if (!mode) throw new Error(`Modo desconhecido: ${id}`);
  return mode;
}
