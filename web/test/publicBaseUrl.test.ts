import { describe, it, expect } from 'vitest';
import { assertPublicBaseUrl } from '../publicBaseUrl.ts';

// og:url/og:image are composed from PUBLIC_BASE_URL by simple string concatenation in index.html
// (see web/vite.config.ts), so a shape mistake here doesn't fail the build — it silently bakes a
// broken image URL and the link preview unfurls blank on LinkedIn/WhatsApp instead of failing loudly.
describe('assertPublicBaseUrl', () => {
  it('is a no-op outside production mode, even when unset', () => {
    expect(() => assertPublicBaseUrl(undefined, 'development')).not.toThrow();
  });
  it('accepts an absolute https URL with no trailing slash', () => {
    expect(() => assertPublicBaseUrl('https://example.test', 'production')).not.toThrow();
  });
  it('throws when unset', () => {
    expect(() => assertPublicBaseUrl(undefined, 'production')).toThrow(/PUBLIC_BASE_URL must be set/);
  });
  it('throws when not https', () => {
    expect(() => assertPublicBaseUrl('http://example.test', 'production')).toThrow(/absolute https URL/);
  });
  it('throws on a trailing slash', () => {
    expect(() => assertPublicBaseUrl('https://example.test/', 'production')).toThrow(/trailing slash/);
  });
});
