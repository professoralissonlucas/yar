/**
 * Geradores de números aleatórios. A lógica do jogo nunca usa Math.random
 * diretamente: recebe uma função rng() que devolve um número em [0, 1).
 */

/** Gerador determinístico (mulberry32) — útil para testes e reprodução de partidas. */
export function createSeededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
