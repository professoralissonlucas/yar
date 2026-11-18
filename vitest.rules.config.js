import { defineConfig } from 'vitest/config';

/**
 * Testes das regras do Firestore no emulador (tests/rules/). Rodar com
 * `npm run test:rules`: o `firebase emulators:exec` liga o emulador, roda
 * estes testes e desliga sozinho (precisa de Java instalado).
 */
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.js'],
    environment: 'node',
    fileParallelism: false, // um emulador só, apagado entre os testes
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
