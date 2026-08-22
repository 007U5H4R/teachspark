import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { assertPublicBaseUrl } from './publicBaseUrl.ts';
import { NON_SPA_ROUTES } from './pwa.routes.ts';

// The repo root holds the single .env (PUBLIC_BASE_URL lives there for Twilio already).
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  // process env (Railway build) wins over .env files, same as Vite's own precedence
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? loadEnv(mode, ROOT, 'PUBLIC_BASE_URL').PUBLIC_BASE_URL;
  assertPublicBaseUrl(publicBaseUrl, mode);
  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'generateSW',
        registerType: 'autoUpdate', // the plugin adds skipWaiting + clientsClaim while injectRegister stays 'auto'
        injectRegister: 'auto',
        // Deliberately no includeAssets, and manifest-icon auto-include off: both glob publicDir in a
        // second pass that ignores workbox.globIgnores (see the note there). globPatterns below already
        // covers every asset the manifest and index.html reference.
        includeManifestIcons: false,
        manifest: {
          name: 'TeachSpark',
          short_name: 'TeachSpark',
          description: 'Ready-to-use worksheets and question papers for your class, on WhatsApp.',
          theme_color: '#0a0a0a',
          background_color: '#0a0a0a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'pwa-*.png', 'maskable-icon-512x512.png', 'apple-touch-icon-180x180.png'],
          // Keeps the 96 KB og-cover.png out of every install; only scrapers fetch it, and Vite still
          // copies it into dist/, so /og-cover.png stays live for link previews.
          // globIgnores filters the globPatterns pass ONLY — includeAssets and includeManifestIcons glob
          // publicDir separately and append their hits as additional manifest entries, bypassing this
          // line entirely. That is why og-cover.png was precached anyway until both were turned off above.
          globIgnores: ['**/og-cover.png'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [NON_SPA_ROUTES],
          cleanupOutdatedCaches: true,
          // No runtimeCaching on purpose: /api and /webhooks must always hit the network.
        },
        devOptions: { enabled: process.env.PWA_DEV === '1' }, // opt-in only; a dev SW masks proxy changes
      }),
    ],
    envDir: ROOT,
    // Exposes VITE_* and exactly PUBLIC_BASE_URL (prefix match == full name) to import.meta.env and
    // to %PUBLIC_BASE_URL% replacement in index.html. Everything else in .env stays server-only.
    envPrefix: ['VITE_', 'PUBLIC_BASE_URL'],
    server: {
      port: 5173,
      proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
    },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
