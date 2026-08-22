// Renders every brand bitmap from inline SVG so the wordmark is crisp and the output is identical on
// every machine. Fonts are vendored (static Inter instances) because resvg ignores variable-font axes.
//   npm run brand:assets   -> web/public/{og-cover.png, pwa-*.png, maskable-icon-512x512.png, apple-touch-icon-180x180.png, favicon.svg}
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { imageSize } from 'image-size';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = resolve(ROOT, 'web/public');
const FONT_FILES = ['Inter-Bold.ttf', 'Inter-Regular.ttf'].map((f) => resolve(ROOT, 'assets/fonts', f));
for (const f of FONT_FILES) if (!existsSync(f)) throw new Error(`missing font file: ${f} (see docs/superpowers/plans Task 13 step 1)`);

const BG = '#0a0a0a';
const LIME = '#b6ff3b';

/** Spark: the same gradients as web/src/components/spark/Spark.tsx, eyes looking slightly right. */
function orb(cx: number, cy: number, r: number, id: string): string {
  const ew = r * 0.24, eh = r * 0.41, rx = ew * 0.45;
  return `
  <defs>
    <radialGradient id="${id}-body" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#2fd65f"/><stop offset="45%" stop-color="#169a3c"/><stop offset="100%" stop-color="#062b14"/></radialGradient>
    <radialGradient id="${id}-gloss" cx="30%" cy="22%" r="45%"><stop offset="0%" stop-color="#fff" stop-opacity=".5"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-body)"/>
  <ellipse cx="${cx - r * 0.33}" cy="${cy - r * 0.53}" rx="${r * 0.47}" ry="${r * 0.32}" fill="url(#${id}-gloss)"/>
  <rect x="${cx - r * 0.36 - ew / 2}" y="${cy - r * 0.06 - eh / 2}" width="${ew}" height="${eh}" rx="${rx}" fill="#fff"/>
  <rect x="${cx + r * 0.18 - ew / 2}" y="${cy - r * 0.06 - eh / 2}" width="${ew}" height="${eh}" rx="${rx}" fill="#fff"/>`;
}

function render(svg: string, width: number, out: string): void {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: 'Inter' }, logLevel: 'warn' }).render().asPng();
  writeFileSync(out, png);
  const { width: w, height: h } = imageSize(readFileSync(out));
  console.log(`wrote ${out} (${w}x${h}, ${png.length} bytes)`);
}

mkdirSync(OUT_DIR, { recursive: true });

// 1) Open Graph cover 1200x630
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BG}"/>
  <ellipse cx="250" cy="520" rx="150" ry="20" fill="#1f8a3a" opacity=".35"/>
  ${orb(250, 315, 150, 'og')}
  <text x="470" y="300" font-family="Inter" font-weight="700" font-size="104" fill="#fff" letter-spacing="-3">TeachSpark</text>
  <text x="474" y="362" font-family="Inter" font-weight="400" font-size="36" fill="${LIME}">Ready-to-use worksheets, on WhatsApp</text>
  <text x="474" y="412" font-family="Inter" font-weight="400" font-size="26" fill="#a3a3a3">3 levels + answer key + PDF, in about 2 minutes.</text>
  <text x="474" y="450" font-family="Inter" font-weight="400" font-size="26" fill="#a3a3a3">Free pilot for teachers.</text>
</svg>`;
// NB: the grey line is split in two on purpose — as one line at 26px it runs past x=1200 and clips ("Free pilot f…").
// Keep each grey line ≤ ~50 characters; open the PNG after generating and confirm nothing touches the right edge.
render(og, 1200, resolve(OUT_DIR, 'og-cover.png'));
const ogBytes = readFileSync(resolve(OUT_DIR, 'og-cover.png')).length;
if (ogBytes > 1_000_000) throw new Error(`og-cover.png is ${ogBytes} bytes; must be < 1 MB`);

// 2) Icons. Transparent for the regular icons; padded on the dark brand background for maskable/apple.
const iconSvg = (size: number, padded: boolean) => {
  const r = padded ? size * 0.3 : size * 0.46;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${padded ? `<rect width="${size}" height="${size}" fill="${BG}"/>` : ''}
  ${orb(size / 2, size / 2, r, 'ic')}
</svg>`;
};
render(iconSvg(192, false), 192, resolve(OUT_DIR, 'pwa-192x192.png'));
render(iconSvg(512, false), 512, resolve(OUT_DIR, 'pwa-512x512.png'));
render(iconSvg(512, true), 512, resolve(OUT_DIR, 'maskable-icon-512x512.png'));
render(iconSvg(180, true), 180, resolve(OUT_DIR, 'apple-touch-icon-180x180.png'));

// 3) SVG favicon (vector; browsers that support it get a crisp tab icon at any size)
writeFileSync(resolve(OUT_DIR, 'favicon.svg'), iconSvg(64, false));
console.log('wrote favicon.svg');
