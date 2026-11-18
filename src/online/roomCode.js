/** Códigos de sala (funções puras). */

/** 2–9 e A–Z sem as letras ambíguas I, L e O (e sem os dígitos 0 e 1). */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_PARAM = 'sala';
export const INVITE_BASE_URL = 'https://professoralissonlucas.github.io/yar/';

const VALID_CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Código aleatório de 6 caracteres. `rng()` devolve um número em [0, 1). */
export function generateRoomCode(rng) {
  if (typeof rng !== 'function') throw new TypeError('generateRoomCode: rng deve ser uma função');
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Normaliza o que o jogador digitou: maiúsculas, sem espaços/traços e sem
 * caracteres que não existem nos códigos; no máximo 6.
 */
export function normalizeRoomCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .split('')
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

/**
 * Código a partir do que o jogador colou no campo: se o texto tiver
 * `sala=XXXXXX` (o link do convite, ou qualquer texto com ele no meio), usa
 * esse valor; senão trata o texto como o próprio código.
 */
export function extractRoomCode(text) {
  const raw = String(text ?? '');
  const match = raw.match(new RegExp(`[?&#]${ROOM_PARAM}=([^&#\\s]*)`, 'i'));
  return normalizeRoomCode(match ? decodeURIComponentSafe(match[1]) : raw);
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isValidRoomCode(code) {
  return typeof code === 'string' && VALID_CODE.test(code);
}

/** Link de convite: https://professoralissonlucas.github.io/yar/?sala=CODIGO */
export function inviteUrl(code, base = INVITE_BASE_URL) {
  const url = new URL(base);
  url.searchParams.set(ROOM_PARAM, code);
  return url.toString();
}

/** Código da sala na query string (?sala=…), já normalizado, ou null se não houver um válido. */
export function roomCodeFromSearch(search) {
  const raw = new URLSearchParams(search).get(ROOM_PARAM);
  const code = normalizeRoomCode(raw);
  return isValidRoomCode(code) ? code : null;
}
