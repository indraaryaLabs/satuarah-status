import { defineConfig } from 'vite';

export default defineConfig({
  root: 'site',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: { port: 5174 },
  preview: { port: 4174 },
});
