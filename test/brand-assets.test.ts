import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { imageSize } from 'image-size';

const pub = (f: string) => fileURLToPath(new URL(`../web/public/${f}`, import.meta.url));

describe('brand assets in web/public', () => {
  it('og-cover.png is 1200x630 and under 1 MB', () => {
    const buf = readFileSync(pub('og-cover.png'));
    expect(imageSize(buf)).toMatchObject({ width: 1200, height: 630, type: 'png' });
    expect(buf.length).toBeLessThan(1_000_000);
  });
  it.each([['pwa-192x192.png', 192], ['pwa-512x512.png', 512], ['maskable-icon-512x512.png', 512], ['apple-touch-icon-180x180.png', 180]])('%s is %ipx square', (file, px) => {
    expect(imageSize(readFileSync(pub(file)))).toMatchObject({ width: px, height: px });
  });
  it('favicon.svg exists and is an svg', () => {
    expect(existsSync(pub('favicon.svg'))).toBe(true);
    expect(readFileSync(pub('favicon.svg'), 'utf8')).toMatch(/^<svg/);
  });
});
