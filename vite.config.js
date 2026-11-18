import { defineConfig } from 'vite';

export default defineConfig({
  base: '/yar/',
  build: {
    // o chunk online (Firebase Auth + Firestore, ~500 kB) só carrega com import()
    // dinâmico quando o jogador escolhe Online; o chunk principal fica pequeno
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['tests/**/*.test.js'],
    // tests/rules/ precisa do emulador do Firestore: `npm run test:rules`
    exclude: ['tests/rules/**', 'node_modules/**'],
    environment: 'node',
  },
});
