import { describe, it, expect } from 'vitest';
import { CITY_COORDS, resolveCity } from '../src/components/IndiaMap/cities.ts';

/**
 * Regression scar. The first version of the map keyed an exact, case-sensitive lookup off a
 * 14-city list, so every one of these REAL pilot sign-ups missed and the dashboard rendered
 * "No locations yet" beside a City bar chart showing 12 people. These are the actual strings
 * teachers typed, pulled from production.
 */
const REAL_PILOT_CITIES = [
  'Raipur', 'Jorhat', 'Bangalore', 'BANGALORE', 'Bangalore Urban', 'Bangalore',
  'HYDERABAD', 'Bangalore', 'Pathankot', 'Raipur', 'Bangalore', 'Raipur',
];

describe('resolveCity', () => {
  it('places every city the live pilot actually produced', () => {
    const unresolved = REAL_PILOT_CITIES.filter((c) => {
      const name = resolveCity(c);
      return !name || !CITY_COORDS[name];
    });
    expect(unresolved).toEqual([]);
  });

  it('folds case, spacing and former names onto one canonical city', () => {
    for (const variant of ['Bangalore', 'BANGALORE', 'bengaluru', ' Bangalore ', 'Bangalore Urban', 'Bangalore, Karnataka']) {
      expect(resolveCity(variant)).toBe('Bengaluru');
    }
    expect(resolveCity('Bombay')).toBe('Mumbai');
    expect(resolveCity('Calcutta')).toBe('Kolkata');
    expect(resolveCity('Trivandrum')).toBe('Thiruvananthapuram');
    expect(resolveCity('gurgaon')).toBe('Gurugram');
  });

  it('prefers the longer name so a contained city cannot hijack it', () => {
    expect(resolveCity('Navi Mumbai')).toBe('Navi Mumbai');
  });

  it('returns null for input it cannot place, rather than guessing', () => {
    expect(resolveCity('')).toBeNull();
    expect(resolveCity('   ')).toBeNull();
    expect(resolveCity('Atlantis')).toBeNull();
    expect(resolveCity('12345')).toBeNull();
  });

  it('gives every resolvable name real coordinates inside India', () => {
    for (const [name, { lng, lat }] of Object.entries(CITY_COORDS)) {
      expect(lng, name).toBeGreaterThan(68);
      expect(lng, name).toBeLessThan(98);
      expect(lat, name).toBeGreaterThan(6);
      expect(lat, name).toBeLessThan(37);
    }
  });
});
