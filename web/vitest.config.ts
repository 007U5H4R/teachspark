import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // No VitePWA here on purpose: the test project does not need a service worker. If a test ever
  // imports web/src/main.tsx it will fail on `virtual:pwa-register` — alias that specifier to a stub
  // in `resolve.alias` rather than pulling the whole PWA plugin into the test build.
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    globals: true, // Testing Library's auto-cleanup hooks into a global afterEach
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    // Node >=22 defines its own global `localStorage` getter (returns undefined without
    // --localstorage-file). Vitest's jsdom global-copy step only force-overrides a key that
    // already exists on the real Node global when that key is in its own hardcoded allowlist;
    // "localStorage" isn't in it (unlike "sessionStorage", which has no native competitor and so
    // is copied from jsdom regardless), so Node's broken getter silently wins over jsdom's real
    // Storage and any `localStorage.*` call throws "Cannot read properties of undefined".
    // Disabling the experimental flag for test workers frees the global for jsdom to populate.
    execArgv: ['--no-experimental-webstorage'],
  },
});
