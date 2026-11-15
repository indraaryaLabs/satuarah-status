import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['monitor/test/**/*.test.ts', 'site/src/**/*.test.ts'],
    environment: 'node',
  },
});
