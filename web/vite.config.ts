import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The repo root holds the single .env (PUBLIC_BASE_URL lives there for Twilio already).
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  // process env (Railway build) wins over .env files, same as Vite's own precedence
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? loadEnv(mode, ROOT, 'PUBLIC_BASE_URL').PUBLIC_BASE_URL;
  if (mode === 'production' && !publicBaseUrl) {
    throw new Error('PUBLIC_BASE_URL must be set at build time (absolute https URL, no trailing slash): og:url/og:image are baked into index.html');
  }
  return {
    plugins: [react()],
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
