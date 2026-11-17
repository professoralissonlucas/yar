import { defineConfig } from 'vite';

export default defineConfig({
  base: '/yar/',
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
