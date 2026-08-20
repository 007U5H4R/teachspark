import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 15_000,
    coverage: { provider: 'v8', include: ['src/**/*.ts'] },
  },
});
