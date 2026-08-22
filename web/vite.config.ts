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
        includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png', 'og-cover.png'],
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
          globIgnores: ['**/og-cover.png'], // scrapers fetch it; no need to precache 60 KB into every install
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
