import { useMemo } from 'react';
import { CITY_COORDS, indiaOutlinePath, project, VIEW_H, VIEW_W } from './cities.ts';
import './IndiaMap.css';

export interface IndiaMapSignup { city: string }

export interface IndiaMapProps {
  /** Recent sign-up rows (only `.city` is read). Tallied here so every city shows, not just the
   * top-10 `landing.byCity` cap. */
  recent: IndiaMapSignup[];
}

const MIN_RADIUS = 3;
const MAX_RADIUS = 9;
const TOP_LABEL_COUNT = 5;

function tallyByCity(recent: IndiaMapSignup[]): Array<{ city: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of recent) {
    const key = r.city.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

export function IndiaMap({ recent }: IndiaMapProps) {
  const tallies = useMemo(() => tallyByCity(recent), [recent]);
  // Skip anything not in the coordinate lookup rather than crashing — an unrecognised city string
  // (a typo, or a real-world city outside the demo set) just does not get a marker.
  const plotted = useMemo(() => tallies.filter((t) => CITY_COORDS[t.city] !== undefined), [tallies]);

  const outlineD = useMemo(() => indiaOutlinePath(), []);
  const maxCount = plotted.reduce((m, t) => Math.max(m, t.count), 0);
  const radiusFor = (count: number): number => {
    if (maxCount <= 0) return MIN_RADIUS;
    const t = count / maxCount;
    return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
  };

  const totalCities = plotted.length;
  const totalTeachers = plotted.reduce((s, t) => s + t.count, 0);

  return (
    <section className="india-map panel">
      <h3 className="panel__title">Where teachers joined from</h3>
      {plotted.length === 0 ? (
        <p className="panel__empty">No locations yet.</p>
      ) : (
        <>
          <svg
            className="india-map__svg"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            role="img"
            aria-label={`Map of India with ${totalCities} cities marked, ${totalTeachers} teachers total`}
          >
            <path className="india-map__outline" d={outlineD} />
            {plotted.map(({ city, count }) => {
              const coords = CITY_COORDS[city]!;
              const { x, y } = project(coords);
              const r = radiusFor(count);
              return (
                <g key={city} className="india-map__marker">
                  <circle cx={x} cy={y} r={r} className="india-map__dot">
                    <title>{`${city} — ${count}`}</title>
                  </circle>
                </g>
              );
            })}
            {plotted.slice(0, TOP_LABEL_COUNT).map(({ city, count }) => {
              const coords = CITY_COORDS[city]!;
              const { x, y } = project(coords);
              const r = radiusFor(count);
              return (
                <text key={`label-${city}`} x={x} y={y - r - 3} className="india-map__label" textAnchor="middle">
                  {city}
                </text>
              );
            })}
          </svg>
          <p className="india-map__caption">
            {totalCities} {totalCities === 1 ? 'city' : 'cities'} · {totalTeachers} teachers · marker size = sign-ups
          </p>
        </>
      )}
    </section>
  );
}
