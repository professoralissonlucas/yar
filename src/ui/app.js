import { MODES } from '../core/modes.js';
import { showGameOver } from './screens/gameOver.js';
import { DEFAULT_NAMES, showStart } from './screens/start.js';
import { showTable } from './screens/table.js';

const STORAGE_KEY = 'yar:settings';
const DEFAULT_SETTINGS = { names: DEFAULT_NAMES, modeId: MODES[0].id, timerEnabled: false };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_SETTINGS };
    return {
      names: Array.isArray(saved.names) ? saved.names.map(String) : DEFAULT_SETTINGS.names,
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

/** Roteador simples: início → mesa → fim de jogo. */
export function startApp(root) {
  let settings = loadSettings();

  function goStart() {
    showStart(root, {
      initial: settings,
      onPlay(config) {
        settings = { names: config.names, modeId: config.modeId, timerEnabled: config.timerEnabled };
        saveSettings(settings);
        // por enquanto só existe o modo local; 'ai' e 'online' entram aqui depois
        goTable(config, 0);
      },
    });
  }

  /** `starter` = índice de quem começa (alterna a cada "Jogar de novo"). */
  function goTable(config, starter) {
    const seats = config.names.map((name, i) => ({ id: `p${i + 1}`, name, controller: 'local' }));
    const players = [...seats.slice(starter), ...seats.slice(0, starter)];
    showTable(root, {
      players,
      modeId: config.modeId,
      timerEnabled: config.timerEnabled,
      onExit: goStart,
      onGameOver: (state) =>
        showGameOver(root, {
          state,
          onPlayAgain: () => goTable(config, (starter + 1) % seats.length),
          onHome: goStart,
        }),
    });
  }

  goStart();
}
