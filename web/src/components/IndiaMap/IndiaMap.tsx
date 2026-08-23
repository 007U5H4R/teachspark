import { useMemo } from 'react';
import { CITY_COORDS, LAKSHADWEEP, indiaIslandPaths, indiaOutlinePath, project, resolveCity, VIEW_H, VIEW_W } from './cities.ts';
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

interface Resolved {
  plotted: Array<{ city: string; count: number }>;
  total: number;
  unmapped: number;
}

/**
 * Group sign-ups by the canonical city their typed name resolves to.
 *
 * `unmapped` is counted, never discarded: the caption has to agree with the sign-up total shown
 * elsewhere on the dashboard, so a place the lookup does not know is reported as unplaced rather
 * than quietly vanishing from both the map and the count.
 */
function resolve(recent: IndiaMapSignup[]): Resolved {
  const counts = new Map<string, number>();
  let total = 0;
  let unmapped = 0;
  for (const r of recent) {
    total += 1;
    const city = resolveCity(r.city ?? '');
    if (!city || !CITY_COORDS[city]) { unmapped += 1; continue; }
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  const plotted = [...counts]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  return { plotted, total, unmapped };
}

export function IndiaMap({ recent }: IndiaMapProps) {
  const { plotted, total, unmapped } = useMemo(() => resolve(recent), [recent]);
  const outlineD = useMemo(() => indiaOutlinePath(), []);
  const islandPaths = useMemo(() => indiaIslandPaths(), []);

  const maxCount = plotted.reduce((m, t) => Math.max(m, t.count), 0);
  const radiusFor = (count: number): number => {
    if (maxCount <= 0) return MIN_RADIUS;
    return MIN_RADIUS + (count / maxCount) * (MAX_RADIUS - MIN_RADIUS);
  };

  const placed = total - unmapped;

  return (
    <section className="india-map panel">
      <h3 className="panel__title">Where teachers joined from</h3>
      {total === 0 ? (
        <p className="panel__empty">No locations yet.</p>
      ) : (
        <>
          <svg
            className="india-map__svg"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            role="img"
            aria-label={`Map of India with ${plotted.length} ${plotted.length === 1 ? 'city' : 'cities'} marked, covering ${placed} of ${total} sign-ups`}
          >
            <path className="india-map__outline" d={outlineD} />
            {islandPaths.map((d, i) => (
              <path key={`island-${i}`} className="india-map__island-outline" d={d} />
            ))}
            {LAKSHADWEEP.map((coords, i) => {
              const { x, y } = project(coords);
              return <circle key={`lak-${i}`} cx={x} cy={y} r={1.4} className="india-map__island" />;
            })}
            {plotted.map(({ city, count }, i) => {
              const { x, y } = project(CITY_COORDS[city]!);
              return (
                <g key={city} className="india-map__marker">
                  <circle cx={x} cy={y} r={radiusFor(count)} className="india-map__dot" style={{ animationDelay: `${(i % 8) * 0.16}s` }}>
                    <title>{`${city} — ${count}`}</title>
                  </circle>
                </g>
              );
            })}
            {plotted.slice(0, TOP_LABEL_COUNT).map(({ city, count }) => {
              const { x, y } = project(CITY_COORDS[city]!);
              return (
                <text key={`label-${city}`} x={x} y={y - radiusFor(count) - 3} className="india-map__label" textAnchor="middle">
                  {city}
                </text>
              );
            })}
          </svg>
          <p className="india-map__caption">
            {plotted.length} {plotted.length === 1 ? 'city' : 'cities'} · {placed} of {total} sign-ups placed · marker size = sign-ups
            {unmapped > 0 && (
              <>
                {' '}
                <span className="india-map__unmapped">({unmapped} not recognised)</span>
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
