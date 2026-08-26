const KEY = 'ts_variant';

export type Variant = 'A' | 'B';

/**
 * Sticky 50/50 A/B bucket for the landing page, assigned once per browser and remembered.
 * A = the original Landing; B = the /v2 "Trusted Teal" redesign. The same value drives which
 * landing App renders at "/" AND the `variant` super-property on every Mixpanel event, so a
 * visitor's whole funnel is attributed to the landing they actually saw.
 */
export function getVariant(): Variant {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing === 'A' || existing === 'B') return existing;
    const v: Variant = Math.random() < 0.5 ? 'A' : 'B';
    localStorage.setItem(KEY, v);
    return v;
  } catch {
    return 'A'; // storage blocked (private mode): fall back to the original, unsplit
  }
}
