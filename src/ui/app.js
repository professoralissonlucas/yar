import { NPCS, getNpc } from '../ai/index.js';
import { MODES } from '../core/modes.js';
import { showGameOver } from './screens/gameOver.js';
import { DEFAULT_NAMES, showStart } from './screens/start.js';
import { showTable } from './screens/table.js';

const STORAGE_KEY = 'yar:settings';
const MATCH_TYPES = ['local', 'npc'];
const DEFAULT_SETTINGS = {
  matchType: 'local',
  names: DEFAULT_NAMES,
  playerName: '',
  npcLevel: NPCS[0].id,
  modeId: MODES[0].id,
  timerEnabled: false,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_SETTINGS };
    return {
      matchType: MATCH_TYPES.includes(saved.matchType) ? saved.matchType : DEFAULT_SETTINGS.matchType,
      names: Array.isArray(saved.names) ? saved.names.map(String) : DEFAULT_SETTINGS.names,
      playerName: typeof saved.playerName === 'string' ? saved.playerName : '',
      npcLevel: NPCS.some((n) => n.id === saved.npcLevel) ? saved.npcLevel : DEFAULT_SETTINGS.npcLevel,
      modeId: MODES.some((m) => m.id === saved.modeId) ? saved.modeId : DEFAULT_SETTINGS.modeId,
      timerEnabled: Boolean(saved.timerEnabled),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // sem armazenamento (aba privada etc.): segue sem lembrar
  }
}

/** Assentos da partida (ordem fixa; quem começa é decidido em goTable). */
function buildSeats(config) {
  if (config.matchType === 'npc') {
    const npc = getNpc(config.npcLevel);
    return [
      // o humano contra a máquina joga como o Prof. Alishow
      { id: 'p1', name: config.playerName, controller: 'local', character: 'alishow' },
      { id: 'npc', name: npc.name, controller: 'npc', npcLevel: npc.id },
    ];
  }
  return config.names.map((name, i) => ({ id: `p${i + 1}`, name, controller: 'local' }));
}

/** Roteador simples: início → mesa → fim de jogo. */
export function startApp(root) {
  let settings = loadSettings();

  function goStart() {
    showStart(root, {
      initial: settings,
      onPlay(config) {
        settings = { ...config };
        saveSettings(settings);
        goTable(config, null);
      },
    });
  }

  /**
   * `previousStarter` = índice de quem começou a partida anterior (ou null).
   * Contra a máquina, quem começa é sorteado; entre 2 pessoas, alterna.
   */
  function goTable(config, previousStarter) {
    const seats = buildSeats(config);
    const starter =
      config.matchType === 'npc'
        ? Math.floor(Math.random() * seats.length)
        : previousStarter === null
          ? 0
          : (previousStarter + 1) % seats.length;
    const players = [...seats.slice(starter), ...seats.slice(0, starter)];
    showTable(root, {
      players,
      modeId: config.modeId,
      timerEnabled: config.timerEnabled,
      onExit: goStart,
      onGameOver: (state) =>
        showGameOver(root, {
          state,
          seats,
          onPlayAgain: () => goTable(config, starter),
          onHome: goStart,
        }),
    });
  }

  goStart();
}
