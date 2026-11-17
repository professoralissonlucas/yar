import { defineConfig } from 'vite';

export default defineConfig({
  base: '/yar-cartas/',
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
