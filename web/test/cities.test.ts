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

  it('prefers the longer word group so a contained city cannot hijack it', () => {
    // NOT plain 'Navi Mumbai' — that is answered by the exact-match pass and never reaches the
    // word-group loop, so it would pass even with the ordering reversed. These need the loop.
    expect(resolveCity('Vashi Navi Mumbai')).toBe('Navi Mumbai');
    expect(resolveCity('Sector 15 Navi Mumbai')).toBe('Navi Mumbai');
  });

  it('never drags a different place onto a city it merely contains', () => {
    // Each of these was placed, confidently and wrongly, by the earlier substring match: a wrong
    // dot is worse than no dot, because the caption reports it as placed.
    expect(resolveCity('Suratgarh')).toBeNull();      // Rajasthan, not Surat (Gujarat)
    expect(resolveCity('Thanesar')).toBeNull();       // Haryana, not Thane (Maharashtra)
    expect(resolveCity('Patnagarh')).toBeNull();      // Odisha, not Patna (Bihar)
    expect(resolveCity('Bhopalpatnam')).toBeNull();   // Chhattisgarh, not Bhopal (MP)
    expect(resolveCity('Jerusalem')).toBeNull();      // not Salem, Tamil Nadu
    // "…an and …" spelled "anand" once spacing was stripped, landing these on Anand, Gujarat.
    expect(resolveCity('Daman and Diu')).toBe('Daman');
    expect(resolveCity('Andaman and Nicobar Islands')).toBeNull();
    expect(resolveCity('Anandpur Sahib')).toBeNull(); // Punjab, not Anand (Gujarat)
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
