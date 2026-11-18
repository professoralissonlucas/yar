import { NPCS, getNpc } from '../ai/index.js';
import { MODES } from '../core/modes.js';
import { ALISHOW } from './characters.js';
import { showGameOver } from './screens/gameOver.js';
import { DEFAULT_NAMES, showStart } from './screens/start.js';
import { showTable } from './screens/table.js';
import { h } from './dom.js';

const STORAGE_KEY = 'yar:settings';
const MATCH_TYPES = ['local', 'npc', 'online'];
/** Parâmetro do link de convite: ?sala=CODIGO */
const ROOM_PARAM = 'sala';
const DEFAULT_SETTINGS = {
  matchType: 'local',
  names: DEFAULT_NAMES,
  playerName: '',
  npcLevel: NPCS[0].id,
  modeId: MODES[0].id,
  timerEnabled: false,
  onlineNickname: '', // último apelido usado no online
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
      onlineNickname: typeof saved.onlineNickname === 'string' ? saved.onlineNickname : '',
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
      { id: 'p1', name: config.playerName, controller: 'local' },
      // a máquina é o Prof. Alishow, no modo (nível) escolhido
      { id: 'npc', name: ALISHOW.name, controller: 'npc', npcLevel: npc.id, character: ALISHOW.id },
    ];
  }
  return config.names.map((name, i) => ({ id: `p${i + 1}`, name, controller: 'local' }));
}

/**
 * Roteador simples: início → mesa → fim de jogo. O modo online (Firebase) é
 * carregado com import() dinâmico só quando o jogador escolhe "Online" ou
 * abre um link de convite (?sala=CODIGO).
 */
export function startApp(root) {
  let settings = loadSettings();

  function goStart() {
    showStart(root, {
      initial: settings,
      onPlay(config) {
        settings = { ...settings, ...config };
        saveSettings(settings);
        if (config.matchType === 'online') goOnline(null);
        else goTable(config, null);
      },
    });
  }

  async function goOnline(roomCode) {
    root.replaceChildren(
      h('div', { class: 'screen online-screen online-loading', role: 'status' }, h('p', { class: 'muted' }, 'Carregando o modo online…')),
    );
    try {
      const { startOnline } = await import('../online/index.js');
      startOnline(root, {
        roomCode,
        settings,
        saveSettings(patch) {
          settings = { ...settings, ...patch };
          saveSettings(settings);
        },
        onHome: goStart,
      });
    } catch (error) {
      console.error(error);
      root.replaceChildren(
        h(
          'div',
          { class: 'screen online-screen online-loading', role: 'alert' },
          h('p', {}, 'Não foi possível carregar o modo online. Verifique a conexão e tente de novo.'),
          h('button', { type: 'button', class: 'btn btn--primary', onClick: goStart }, 'Voltar ao início'),
        ),
      );
    }
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

  const invitedRoom = new URLSearchParams(window.location.search).get(ROOM_PARAM);
  if (invitedRoom) goOnline(invitedRoom);
  else goStart();
}
