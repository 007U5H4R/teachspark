// Coordinate lookup + lng/lat -> SVG projection for the India map. Keys MUST exactly match the
// city names produced by src/metrics/demoSeed.ts's DEMO_CITIES (and, for real admin data, whatever
// city string a landing sign-up used) — a name not in this map is simply skipped by the component.
//
// The outline itself is REAL boundary data (Natural Earth 10m, India point-of-view, public domain)
// generated into indiaOutline.ts, projected through the SAME `project()` as the city markers, so
// cities always land in the right place on the map.

import { INDIA_BBOX, INDIA_ISLANDS, INDIA_MAINLAND, type Ring } from './indiaOutline.ts';

export interface LngLat { lng: number; lat: number }

/** Projection window = the data's bounding box with a little breathing room for the glow. */
const PAD = 0.8;
export const BOUNDS = {
  lngMin: INDIA_BBOX.lngMin - PAD,
  lngMax: INDIA_BBOX.lngMax + PAD,
  latMin: INDIA_BBOX.latMin - PAD,
  latMax: INDIA_BBOX.latMax + PAD,
} as const;

// Height is fixed; width is derived from the window's TRUE aspect ratio (longitudes converge with
// latitude, so a degree of longitude is narrower than a degree of latitude at India's latitudes).
// Baking the cos(mid-latitude) correction into the frame keeps `project()` a simple linear map while
// still rendering India undistorted.
const MID_LAT_RAD = (((BOUNDS.latMin + BOUNDS.latMax) / 2) * Math.PI) / 180;
const LNG_SPAN = (BOUNDS.lngMax - BOUNDS.lngMin) * Math.cos(MID_LAT_RAD);
const LAT_SPAN = BOUNDS.latMax - BOUNDS.latMin;
export const VIEW_H = 330;
export const VIEW_W = Math.round((VIEW_H * LNG_SPAN) / LAT_SPAN);

/** Linear lng/lat -> SVG x/y. Latitude is inverted because SVG y grows downward. */
export function project({ lng, lat }: LngLat): { x: number; y: number } {
  const x = ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * VIEW_W;
  const y = ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * VIEW_H;
  return { x, y };
}

export const CITY_COORDS: Record<string, LngLat> = {
  Delhi: { lng: 77.21, lat: 28.61 },
  Mumbai: { lng: 72.88, lat: 19.08 },
  Bengaluru: { lng: 77.59, lat: 12.97 },
  Kolkata: { lng: 88.36, lat: 22.57 },
  Chennai: { lng: 80.27, lat: 13.08 },
  Hyderabad: { lng: 78.49, lat: 17.39 },
  Pune: { lng: 73.86, lat: 18.52 },
  Jaipur: { lng: 75.79, lat: 26.91 },
  Ahmedabad: { lng: 72.57, lat: 23.03 },
  Lucknow: { lng: 80.95, lat: 26.85 },
  Guwahati: { lng: 91.74, lat: 26.15 },
  Kochi: { lng: 76.27, lat: 9.93 },
  Bhopal: { lng: 77.41, lat: 23.26 },
  Chandigarh: { lng: 76.78, lat: 30.73 },
};

/** Lakshadweep atolls — too small to survive the data simplification, added as decorative dots. */
export const LAKSHADWEEP: LngLat[] = [
  { lng: 72.64, lat: 11.2 }, { lng: 73.05, lat: 10.57 }, { lng: 72.18, lat: 10.06 },
];

function ringToPath(ring: Ring): string {
  const [first, ...rest] = ring.map(([lng, lat]) => project({ lng, lat }));
  if (!first) return '';
  const cmds = [`M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`, ...rest.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)];
  return `${cmds.join(' ')} Z`;
}

/** SVG path for the mainland outline. */
export function indiaOutlinePath(): string {
  return ringToPath(INDIA_MAINLAND);
}

/** SVG paths for the island polygons (Andaman & Nicobar). */
export function indiaIslandPaths(): string[] {
  return INDIA_ISLANDS.map(ringToPath);
}
