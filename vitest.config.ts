import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { provider: 'v8', include: ['src/**/*.ts'] }, // not allowed inside a project: stays at root
    projects: [
      {
        test: {
          name: 'api',
          root: '.',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 15_000,
        },
      },
      'web/vitest.config.ts',
    ],
  },
});
