// Coordinate lookup + lng/lat -> SVG projection for the India map. Keys MUST exactly match the
// city names produced by src/metrics/demoSeed.ts's DEMO_CITIES (and, for real admin data, whatever
// city string a landing sign-up used) — a name not in this map is simply skipped by the component.

export interface LngLat { lng: number; lat: number }

/** lng 68→98°E, lat 6→37°N covers mainland India with a little margin. */
export const BOUNDS = { lngMin: 68, lngMax: 98, latMin: 6, latMax: 37 } as const;

/** SVG viewBox the map and the boundary outline are both drawn in. */
export const VIEW_W = 300;
export const VIEW_H = 330;

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

/**
 * Simplified national outline as a lng/lat polygon, clockwise from Kashmir. Not survey-accurate —
 * it is a compact, recognizable silhouette (the Kashmir bulge, the north-eastern fingers, the
 * eastern and western coastlines tapering to Kanyakumari) — projected through the SAME `project()`
 * used for city markers, so cities always land in the right place relative to the outline even
 * though neither is geodetically precise.
 */
export const INDIA_BOUNDARY: LngLat[] = [
  { lng: 74.5, lat: 34.8 }, { lng: 77.8, lat: 34.8 }, { lng: 79.5, lat: 33.0 },
  { lng: 81.0, lat: 30.5 }, { lng: 84.0, lat: 29.0 }, { lng: 88.0, lat: 27.2 },
  { lng: 89.0, lat: 26.8 }, { lng: 92.0, lat: 27.5 }, { lng: 95.2, lat: 29.0 },
  { lng: 97.2, lat: 28.4 }, { lng: 96.4, lat: 27.0 }, { lng: 95.0, lat: 26.0 },
  { lng: 93.5, lat: 24.0 }, { lng: 92.5, lat: 22.5 }, { lng: 91.0, lat: 22.0 },
  { lng: 89.0, lat: 22.1 }, { lng: 88.5, lat: 21.5 }, { lng: 87.0, lat: 21.5 },
  { lng: 86.5, lat: 20.0 }, { lng: 85.0, lat: 19.5 }, { lng: 84.0, lat: 18.0 },
  { lng: 83.0, lat: 17.0 }, { lng: 82.0, lat: 16.5 }, { lng: 80.5, lat: 15.8 },
  { lng: 80.3, lat: 13.5 }, { lng: 79.9, lat: 12.0 }, { lng: 79.8, lat: 10.5 },
  { lng: 79.3, lat: 9.3 }, { lng: 78.2, lat: 8.9 }, { lng: 77.0, lat: 8.5 },
  { lng: 76.0, lat: 9.5 }, { lng: 75.8, lat: 11.0 }, { lng: 75.0, lat: 12.0 },
  { lng: 74.5, lat: 13.5 }, { lng: 73.8, lat: 15.5 }, { lng: 72.9, lat: 18.9 },
  { lng: 72.8, lat: 20.5 }, { lng: 72.0, lat: 21.5 }, { lng: 69.5, lat: 22.5 },
  { lng: 68.2, lat: 23.5 }, { lng: 70.0, lat: 24.0 }, { lng: 70.5, lat: 25.0 },
  { lng: 71.0, lat: 27.0 }, { lng: 70.5, lat: 28.0 }, { lng: 74.0, lat: 32.0 },
];

/** Build an SVG path `d` string from the boundary polygon, closing the loop. */
export function indiaOutlinePath(): string {
  const pts = INDIA_BOUNDARY.map(project);
  const [first, ...rest] = pts;
  if (!first) return '';
  const cmds = [`M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`, ...rest.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)];
  return `${cmds.join(' ')} Z`;
}
