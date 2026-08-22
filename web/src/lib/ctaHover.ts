// A one-line pub/sub so any call-to-action can make Spark react, wherever it sits in the tree.
//
// The nav's "Sign up" button is rendered by App, while the orb it should affect lives inside
// Landing. Neither can see the other, and threading a ref through App would make App re-render on
// hover for no reason. This keeps the coupling to a single event name.

type Listener = (hovering: boolean) => void;

const listeners = new Set<Listener>();

/** Returns an unsubscribe function, so callers can hand it straight back from a useEffect. */
export function onCtaHover(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function emitCtaHover(hovering: boolean): void {
  // Copy first: a listener that unsubscribes itself would otherwise mutate the set mid-iteration.
  for (const fn of [...listeners]) fn(hovering);
}
