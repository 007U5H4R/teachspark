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

/** The eyes, drawn identically in both variants. Offset right so the static orb looks alive. */
function eyes(cx: number, cy: number, r: number): string {
  const ew = r * 0.24, eh = r * 0.41, rx = ew * 0.45;
  return `
  <rect x="${cx - r * 0.36 - ew / 2}" y="${cy - r * 0.06 - eh / 2}" width="${ew}" height="${eh}" rx="${rx}" fill="#fff"/>
  <rect x="${cx + r * 0.18 - ew / 2}" y="${cy - r * 0.06 - eh / 2}" width="${ew}" height="${eh}" rx="${rx}" fill="#fff"/>`;
}

/**
 * Translucent glass Spark, mirroring the gradients in web/src/components/spark/Spark.tsx so the
 * link preview matches the page it links to. Offsets are expressed as fractions of `r`, which is
 * how they map back: Spark's viewBox is 400 with r=150, so e.g. its halo at r=196 is 1.31r here.
 *
 * ONLY safe on a dark background. Every fill is partly transparent, so on transparency this
 * renders as a faint smudge — which is why the icons below use the solid variant instead.
 */
function glassOrb(cx: number, cy: number, r: number, id: string): string {
  return `
  <defs>
    <radialGradient id="${id}-body" cx="47%" cy="57%" r="96%">
      <stop offset="0%" stop-color="#54ff92" stop-opacity=".44"/><stop offset="16%" stop-color="#2ecf66" stop-opacity=".38"/>
      <stop offset="36%" stop-color="#179544" stop-opacity=".33"/><stop offset="60%" stop-color="#0d5b2b" stop-opacity=".30"/>
      <stop offset="100%" stop-color="#0a2b18" stop-opacity=".32"/>
    </radialGradient>
    <radialGradient id="${id}-haze" cx="42%" cy="15%" r="72%">
      <stop offset="0%" stop-color="#e8f4ec" stop-opacity=".26"/><stop offset="42%" stop-color="#95b8a4" stop-opacity=".10"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-edge" cx="50%" cy="50%" r="50%">
      <stop offset="84%" stop-color="#e6fff0" stop-opacity="0"/><stop offset="96%" stop-color="#e6fff0" stop-opacity=".11"/>
      <stop offset="100%" stop-color="#fff" stop-opacity=".24"/>
    </radialGradient>
    <linearGradient id="${id}-rim" x1="12%" y1="4%" x2="88%" y2="98%">
      <stop offset="0%" stop-color="#f6fffa" stop-opacity=".62"/><stop offset="26%" stop-color="#a5e6bd" stop-opacity=".16"/>
      <stop offset="60%" stop-color="#2c6f45" stop-opacity=".05"/><stop offset="86%" stop-color="#8fdcac" stop-opacity=".20"/>
      <stop offset="100%" stop-color="#d8fbe6" stop-opacity=".34"/>
    </linearGradient>
    <radialGradient id="${id}-halo" cx="50%" cy="50%" r="50%">
      <stop offset="55%" stop-color="#1cb14a" stop-opacity=".22"/><stop offset="100%" stop-color="#1cb14a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-gloss" cx="32%" cy="24%" r="42%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".34"/><stop offset="55%" stop-color="#fff" stop-opacity=".06"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-pool" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3ee071" stop-opacity=".30"/><stop offset="45%" stop-color="#17903f" stop-opacity=".14"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.31}" fill="url(#${id}-halo)"/>
  <ellipse cx="${cx}" cy="${cy + r * 1.19}" rx="${r * 0.95}" ry="${r * 0.26}" fill="url(#${id}-pool)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-body)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-haze)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-edge)"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.993}" fill="none" stroke="url(#${id}-rim)" stroke-width="${Math.max(1, r * 0.011)}"/>
  <ellipse cx="${cx - r * 0.32}" cy="${cy - r * 0.52}" rx="${r * 0.44}" ry="${r * 0.29}" fill="url(#${id}-gloss)"/>
  ${eyes(cx, cy, r)}`;
}

/**
 * Solid Spark for the app icons. Deliberately NOT the glass treatment: the regular PWA icons are
 * rendered on transparency and have to stay legible at 48px on a home screen, where a translucent
 * sphere reads as a smudge.
 */
function solidOrb(cx: number, cy: number, r: number, id: string): string {
  return `
  <defs>
    <radialGradient id="${id}-body" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#2fd65f"/><stop offset="45%" stop-color="#169a3c"/><stop offset="100%" stop-color="#062b14"/></radialGradient>
    <radialGradient id="${id}-gloss" cx="30%" cy="22%" r="45%"><stop offset="0%" stop-color="#fff" stop-opacity=".5"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-body)"/>
  <ellipse cx="${cx - r * 0.33}" cy="${cy - r * 0.53}" rx="${r * 0.47}" ry="${r * 0.32}" fill="url(#${id}-gloss)"/>
  ${eyes(cx, cy, r)}`;
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
  ${glassOrb(250, 300, 150, 'og')}
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
  ${solidOrb(size / 2, size / 2, r, 'ic')}
</svg>`;
};
render(iconSvg(192, false), 192, resolve(OUT_DIR, 'pwa-192x192.png'));
render(iconSvg(512, false), 512, resolve(OUT_DIR, 'pwa-512x512.png'));
render(iconSvg(512, true), 512, resolve(OUT_DIR, 'maskable-icon-512x512.png'));
render(iconSvg(180, true), 180, resolve(OUT_DIR, 'apple-touch-icon-180x180.png'));

// 3) SVG favicon (vector; browsers that support it get a crisp tab icon at any size)
writeFileSync(resolve(OUT_DIR, 'favicon.svg'), iconSvg(64, false));
console.log('wrote favicon.svg');
