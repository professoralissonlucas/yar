/**
 * Entrada do modo online (carregada com import() dinâmico pelo app.js).
 * Fluxo: login → apelido → lobby → sala de espera → mesa → resultado.
 */
import '../ui/online.css';
import { h } from '../ui/dom.js';
import { showLobby } from '../ui/screens/online/lobby.js';
import { showLogin, showNickname } from '../ui/screens/online/login.js';
import { showWaitingRoom } from '../ui/screens/online/waitingRoom.js';
import { onlineHeader } from '../ui/screens/online/common.js';
import { createConnectionToast } from '../ui/screens/online/connectionToast.js';
import { createConnectionState } from './connection.js';
import { showOnlineResult } from '../ui/screens/online/result.js';
import { startOnlineMatch } from './sync.js';
import {
  authErrorMessage,
  signInAsGuest,
  signInWithGoogle,
  signOutUser,
  suggestNickname,
  watchUser,
} from './auth.js';
import { ROOM_PARAM, isValidRoomCode, normalizeRoomCode } from './roomCode.js';
import {
  JOIN_ERROR_MESSAGES,
  PRESENCE_INTERVAL_MS,
  createServerClock,
  fromGameDoc,
  otherUid,
  presenceStatus,
  roomResult,
  toMillis,
} from './roomState.js';
import {
  createRoom,
  heartbeat,
  joinRoom,
  msSinceLastWrite,
  roomErrorMessage,
  startMatch,
  voteRematch,
  watchRoom,
} from './rooms.js';

/** Reavalia a presença do outro mesmo sem snapshots novos. */
const PRESENCE_CHECK_MS = 5000;
/** De quanto em quanto tempo confere se precisa mandar o sinal de vida. */
const HEARTBEAT_CHECK_MS = 10 * 1000;

function setRoomInUrl(code) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set(ROOM_PARAM, code);
  else url.searchParams.delete(ROOM_PARAM);
  window.history.replaceState(null, '', url);
}

export function startOnline(root, { roomCode, settings, saveSettings, onHome }) {
  let user;
  let nickname = null; // confirmado nesta visita ao online
  let stopAuth = null;
  let session = null; // sala aberta (ver enterRoom)
  // código do link de convite: depois do login entra direto
  let pendingCode = roomCode ? normalizeRoomCode(roomCode) : null;
  let lobbyNotice = null;

  // aviso "Sem internet / Conexão restabelecida" em todas as telas online
  const toast = createConnectionToast();
  const connection = createConnectionState({
    browserOnline: navigator.onLine !== false,
    onChange: (status) => toast.set(status),
  });
  const onBrowserOnline = () => connection.setBrowserOnline(true);
  const onBrowserOffline = () => connection.setBrowserOnline(false);
  window.addEventListener('online', onBrowserOnline);
  window.addEventListener('offline', onBrowserOffline);
  if (connection.status === 'offline') toast.set('offline');

  const account = () => ({ user, nickname, onSignOut: signOut });

  function leaveOnline() {
    session?.close();
    session = null;
    stopAuth?.();
    stopAuth = null;
    window.removeEventListener('online', onBrowserOnline);
    window.removeEventListener('offline', onBrowserOffline);
    toast.destroy();
    setRoomInUrl(null);
    onHome();
  }

  async function signOut() {
    session?.close();
    session = null;
    setRoomInUrl(null);
    nickname = null;
    await signOutUser(); // watchUser leva de volta ao login
  }

  const withAuthMessage = (action) => async () => {
    try {
      await action();
    } catch (error) {
      throw new Error(authErrorMessage(error));
    }
  };

  function route() {
    if (session) return;
    if (!user) {
      showLogin(root, {
        onGoogle: withAuthMessage(signInWithGoogle),
        onGuest: withAuthMessage(signInAsGuest),
        onBack: leaveOnline,
        notice: pendingCode ? `Entre para jogar na sala ${pendingCode}.` : null,
      });
    } else if (!nickname) {
      showNickname(root, {
        initial: suggestNickname(user, settings.onlineNickname),
        account: { user, nickname: null, onSignOut: signOut },
        onBack: leaveOnline,
        onConfirm(value) {
          nickname = value;
          saveSettings({ onlineNickname: value });
          route();
        },
      });
    } else if (pendingCode) {
      const code = pendingCode;
      pendingCode = null;
      autoJoin(code);
    } else {
      goLobby();
    }
  }

  function goLobby({ notice = lobbyNotice, joinError = null, code = '' } = {}) {
    lobbyNotice = null;
    setRoomInUrl(null);
    const lobby = showLobby(root, {
      account: account(),
      onBack: leaveOnline,
      initialModeId: settings.modeId,
      initialTimer: settings.timerEnabled,
      initialCode: code,
      notice,
      async onCreate({ modeId, timerEnabled }) {
        saveSettings({ modeId, timerEnabled });
        try {
          const created = await createRoom({ uid: user.uid, name: nickname, modeId, timerEnabled });
          enterRoom(created);
        } catch (error) {
          throw new Error(roomErrorMessage(error));
        }
      },
      async onJoin(joinCode) {
        try {
          await joinRoom(joinCode, { uid: user.uid, name: nickname });
          enterRoom(joinCode);
        } catch (error) {
          throw new Error(roomErrorMessage(error));
        }
      },
    });
    if (joinError) lobby.showJoinError(joinError);
  }

  /** Link de convite (?sala=CODIGO): entra direto depois do login. */
  async function autoJoin(code) {
    if (!isValidRoomCode(code)) {
      goLobby({ joinError: JOIN_ERROR_MESSAGES.invalid });
      return;
    }
    root.replaceChildren(
      h(
        'div',
        { class: 'screen online-screen' },
        onlineHeader({ title: `Entrando na sala ${code}…`, account: account() }),
      ),
    );
    try {
      await joinRoom(code, { uid: user.uid, name: nickname });
      enterRoom(code);
    } catch (error) {
      goLobby({ code, joinError: roomErrorMessage(error) });
    }
  }

  /**
   * Abre a sala: uma única assinatura onSnapshot e o sinal de vida a cada
   * 20 s enquanto o jogador estiver nela. A tela mostrada segue o `status`.
   */
  function enterRoom(code) {
    setRoomInUrl(code);
    const uid = user.uid;
    const clock = createServerClock();
    let room = null;
    let screen = null; // { kind, update(room, { uid, opponentStatus }), destroy? }
    let closed = false;
    let finishedMatch = 0; // última partida cujo resultado já foi mostrado

    // Sinal de vida: toda gravação minha já atualiza o lastSeen, então o
    // heartbeat só grava se eu fiquei 30 s sem gravar nada (ex.: na vez do outro).
    const beat = () => heartbeat(code, uid).catch(() => {});
    beat();
    const beatTimer = setInterval(() => {
      if (msSinceLastWrite(code) >= PRESENCE_INTERVAL_MS) beat();
    }, HEARTBEAT_CHECK_MS);
    const presenceTimer = setInterval(refreshPresence, PRESENCE_CHECK_MS);

    const stopWatch = watchRoom(
      code,
      (next, { pending, fromCache }) => {
        if (closed) return;
        connection.setFromCache(fromCache);
        if (!next) {
          if (fromCache) return; // sem conexão: o cache ainda não tem a sala
          exit('Essa sala não existe mais.');
          return;
        }
        if (!pending) clock.observe(toMillis(next.presence?.[uid]));
        room = next;
        show();
      },
      (error) => exit(roomErrorMessage(error)),
    );

    function opponentStatus() {
      const other = room && otherUid(room, uid);
      if (!other) return 'online';
      return presenceStatus(toMillis(room.presence?.[other]), clock.now());
    }

    function refreshPresence() {
      if (room && screen) screen.update(room, { uid, opponentStatus: opponentStatus() });
    }

    /**
     * Qual tela a sala pede agora: 'waiting', 'table:N' ou 'result:N' (N = nº
     * da partida). Quando a partida termina normalmente, a mesa aberta segue
     * até o aviso "Fim de jogo!" e ela mesma abre o resultado (onGameOver).
     */
    function wantedKind() {
      if (room.status === 'waiting') return 'waiting';
      if (room.status === 'playing') {
        // meu resultado já está na tela e o servidor ainda não recebeu o fim
        return room.match === finishedMatch ? `result:${room.match}` : `table:${room.match}`;
      }
      if (screen?.kind === `table:${room.match}` && !room.forfeitUid) return screen.kind;
      return `result:${room.match}`;
    }

    function show() {
      const kind = wantedKind();
      if (screen?.kind !== kind) {
        screen?.destroy?.();
        screen = null;
        if (kind === 'waiting') screen = openWaiting();
        else if (kind.startsWith('table:')) screen = openTable();
        else screen = openResult(null, null);
      }
      screen.update(room, { uid, opponentStatus: opponentStatus() });
    }

    function openWaiting() {
      const view = showWaitingRoom(root, {
        code,
        account: { ...account(), onSignOut: signOut },
        onLeave: () => exit(null),
        async onStart() {
          try {
            await startMatch(code, uid);
          } catch (error) {
            throw new Error(roomErrorMessage(error));
          }
        },
      });
      return { kind: 'waiting', update: view.update };
    }

    function openTable() {
      const matchNumber = room.match;
      const match = startOnlineMatch(root, {
        room,
        uid,
        onExit: () => exit(null),
        onGameOver(finalState, seats) {
          if (closed) return;
          screen = openResult(finalState, seats);
          screen.update(room, { uid, opponentStatus: opponentStatus() });
        },
      });
      return { kind: `table:${matchNumber}`, update: match.update, destroy: match.destroy };
    }

    /**
     * `finalState`: estado final vindo da mesa (ou null: usa o do servidor,
     * como no abandono ou ao recarregar a página numa sala já terminada).
     */
    function openResult(finalState, seats) {
      const matchNumber = room.match;
      finishedMatch = matchNumber;
      let state = finalState;
      let result = null;
      try {
        if (room.forfeitUid || !state) {
          state = fromGameDoc(room.game);
          result = room.forfeitUid ? roomResult(room) : null;
        }
      } catch {
        exit('Não foi possível ler o resultado da partida.');
        return { kind: 'closed', update: () => {} };
      }
      const view = showOnlineResult(root, {
        state,
        seats: seats ?? state.players.map((p) => ({ id: p.id, name: p.name, controller: p.id === uid ? 'local' : 'remote' })),
        room,
        uid,
        result,
        async onRematch() {
          try {
            await voteRematch(code, uid);
          } catch (error) {
            throw new Error(roomErrorMessage(error));
          }
        },
        onLeave: () => exit(null),
      });
      return { kind: `result:${matchNumber}`, update: view.update };
    }

    function close() {
      if (closed) return;
      closed = true;
      stopWatch();
      clearInterval(beatTimer);
      clearInterval(presenceTimer);
      connection.setFromCache(false);
      screen?.destroy?.();
      screen = null;
    }

    function exit(message) {
      close();
      if (session === current) session = null;
      goLobby({ notice: message });
    }

    const current = { close };
    session = current;
  }

  stopAuth = watchUser((next) => {
    const changed = (next?.uid ?? null) !== (user?.uid ?? null);
    user = next;
    if (changed || user === null) nickname = null;
    if (changed && session) {
      session.close();
      session = null;
    }
    route();
  });
}

