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
        injectRegister: 'auto', // NOT false: the plugin reads the RAW value before resolving it, so any other
                                // value silently drops workbox.skipWaiting/clientsClaim and breaks autoUpdate.
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
          // Defensive only: globPatterns above has no *.png catch-all, so the 96 KB scraper-only
          // og-cover.png is not a candidate for this pass to ignore today. This line earns its keep
          // if a broader png pattern is ever added. Vite copies the file into dist/ regardless, so
          // /og-cover.png stays live for link previews either way.
          // globIgnores filters the globPatterns pass ONLY — includeAssets and includeManifestIcons glob
          // publicDir separately and append their hits as additional manifest entries, bypassing this
          // line entirely. That is why og-cover.png was precached anyway until both were turned off above.
          globIgnores: ['**/og-cover.png'],
          navigateFallback: '/index.html',
          // NON_SPA_ROUTES keeps backend prefixes off the SPA shell; the second pattern keeps
          // static files off it too. Without it, a navigation to /sample-worksheet.pdf (or any
          // /*.png, /*.docx) matched navigateFallback and rendered index.html — the SPA — instead
          // of the file. It matches a final path segment containing a dot (a real extension) and
          // never matches an SPA route (/, /join, /privacy, /v2, /admin, /spark carry no dot).
          navigateFallbackDenylist: [NON_SPA_ROUTES, /\/[^/?#]+\.[^/?#]+$/],
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
