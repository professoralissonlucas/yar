/** Login do modo online: Google (popup) ou convidado (anônimo). */
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase.js';

export { cleanNickname, suggestNickname, accountLabel, NICKNAME_MAX_LENGTH } from './nickname.js';

/** Chama `callback(user | null)` agora e a cada mudança. Devolve a função para parar. */
export function watchUser(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentUser() {
  return auth.currentUser;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const { user } = await signInWithPopup(auth, provider);
  return user;
}

export async function signInAsGuest() {
  const { user } = await signInAnonymously(auth);
  return user;
}

export function signOutUser() {
  return signOut(auth);
}

/** Mensagem em português para os erros mais comuns do login. */
export function authErrorMessage(error) {
  switch (error?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login cancelado.';
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela de login. Permita pop-ups para este site e tente de novo.';
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet. Verifique e tente de novo.';
    case 'auth/unauthorized-domain':
      return 'Este endereço não está autorizado no Firebase (Authentication → Domínios autorizados).';
    case 'auth/operation-not-allowed':
      return 'Esse tipo de login não está ativado no Firebase.';
    default:
      return 'Não foi possível entrar. Tente de novo.';
  }
}
