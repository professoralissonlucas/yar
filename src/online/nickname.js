/** Apelido do jogador online (funções puras, sem Firebase). */

export const NICKNAME_MAX_LENGTH = 16;

/** Tira espaços extras e corta em 16 caracteres (sem quebrar emoji/acentos ao meio). */
export function cleanNickname(value) {
  const collapsed = String(value ?? '').replace(/\s+/g, ' ').trim();
  return [...collapsed].slice(0, NICKNAME_MAX_LENGTH).join('').trim();
}

/** Primeiro nome de um displayName ("Ana Maria Souza" → "Ana"). */
export function firstName(displayName) {
  return cleanNickname(String(displayName ?? '').trim().split(/\s+/)[0] ?? '');
}

/**
 * Apelido sugerido no campo depois do login: o último usado neste aparelho;
 * senão o primeiro nome da conta Google; senão vazio.
 */
export function suggestNickname(user, lastUsed) {
  return cleanNickname(lastUsed) || firstName(user?.displayName) || '';
}

/** Rótulo de quem está logado: "Ana (Google)" / "Ana (convidado)". */
export function accountLabel(user, nickname) {
  const kind = user?.isAnonymous ? 'convidado' : 'Google';
  return `${nickname || firstName(user?.displayName) || 'Jogador'} (${kind})`;
}
