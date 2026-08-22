// Build-time guard, split out of vite.config.ts so it can be unit tested: importing vite.config.ts
// itself from a test breaks its `import.meta.url`-based ROOT resolution (Vitest's SSR module loader
// doesn't give it a `file://` URL the way Vite's own config loader does).
//
// index.html composes og:url as `${PUBLIC_BASE_URL}/` and og:image as `${PUBLIC_BASE_URL}/og-cover.png`
// (see the %PUBLIC_BASE_URL% replacements in web/index.html), so a shape mistake here doesn't fail the
// build or the deployed page — it silently bakes a broken image URL and the link preview unfurls blank
// on LinkedIn/WhatsApp. Checked, not just presence: must be set, must be https, must not end in "/".
export function assertPublicBaseUrl(publicBaseUrl: string | undefined, mode: string): void {
  if (mode !== 'production') return;
  const suffix = 'og:url/og:image are baked into index.html';
  if (!publicBaseUrl) {
    throw new Error(`PUBLIC_BASE_URL must be set at build time (absolute https URL, no trailing slash): ${suffix}`);
  }
  if (!publicBaseUrl.startsWith('https://')) {
    throw new Error(`PUBLIC_BASE_URL must be an absolute https URL, got ${JSON.stringify(publicBaseUrl)}: ${suffix}`);
  }
  if (publicBaseUrl.endsWith('/')) {
    throw new Error(`PUBLIC_BASE_URL must not have a trailing slash, got ${JSON.stringify(publicBaseUrl)}: ${suffix}`);
  }
}
