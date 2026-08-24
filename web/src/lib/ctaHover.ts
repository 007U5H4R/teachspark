// A one-line pub/sub so any element in the nav can tell the landing orb which expression to make.
//
// The nav (logo, tabs, "Sign up") is rendered by App, while the orb it should affect lives inside
// Landing. Neither can see the other, and threading a ref through App would make App re-render on
// hover for no reason. This keeps the coupling to a single channel that carries a hover intent
// (or null when the pointer leaves).

export type OrbIntent = 'love' | 'skeptical' | 'starry';
type Listener = (intent: OrbIntent | null) => void;

const listeners = new Set<Listener>();

/** Returns an unsubscribe function, so callers can hand it straight back from a useEffect. */
export function onOrbHover(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function emitOrbHover(intent: OrbIntent | null): void {
  // Copy first: a listener that unsubscribes itself would otherwise mutate the set mid-iteration.
  for (const fn of [...listeners]) fn(intent);
}
