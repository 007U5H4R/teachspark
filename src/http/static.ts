import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

// src/http/ and dist/http/ are both exactly two levels below the repo root, so the same relative
// URL resolves to <repo>/web/dist under `tsx src/index.ts` and under `node dist/index.js`.
export const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

const NO_CACHE = /(?:^|[\\/])(?:index\.html|sw\.js|workbox-[^\\/]+\.js|registerSW\.js|manifest\.webmanifest)$/;

// Mirrors NON_SPA_ROUTES in web/pwa.routes.ts exactly: the Express fallback and the service
// worker must agree on which prefixes are never the SPA, so keep the two regexes identical.
//
// `admin` was removed when the dashboard landed: /admin is now an SPA page. The JSON it reads
// lives at /api/admin/metrics, and `api` is still on this list, so the service worker never
// intercepts it. The deprecated GET /admin/metrics alias still answers because Express matches a
// registered route before this fallback is ever reached.
export const NON_SPA_ROUTES = /^\/(api|webhooks|internal|health)(?=[\/?#]|$)/;

/**
 * Serves the Vite build and falls back to index.html for client-side routes.
 * Must be called AFTER every API/webhook route (the fallback is a GET catch-all).
 * Returns false and mounts nothing when the build is absent, so API-only boots still work.
 */
export function mountSpa(app: express.Express, dir: string): boolean {
  const index = path.join(dir, 'index.html');
  if (!existsSync(index)) return false;

  app.use(
    express.static(dir, {
      index: false, // the fallback owns '/', so index.html always gets no-cache
      setHeaders(res, filePath) {
        const rel = path.relative(dir, filePath); // filePath is absolute; anchor to the served root
        if (rel.startsWith(`assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // content-hashed by Vite
        } else if (NO_CACHE.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache'); // revalidate via ETag; stale SW/manifest must not linger
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400'); // icons, og-cover.png, favicon
        }
      },
    }),
  );

  // Express 5 syntax: '/{*splat}' (braces) also matches bare '/'. GET only, so POSTs never get HTML.
  app.get('/{*splat}', (req, res, next) => {
    if (NON_SPA_ROUTES.test(req.path) || path.extname(req.path)) return next(); // reserved prefix, or a typo'd asset that should 404
    res.sendFile(index, { headers: { 'Cache-Control': 'no-cache' } });
  });
  return true;
}
