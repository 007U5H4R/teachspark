import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * Manages scroll position across client-side navigations. React Router does neither half of this.
 *
 * 1. **Hash targets.** Browsers only resolve a fragment on a real document load. React Router
 *    navigates with history.pushState, so `/#how` updated the address bar and the page never
 *    moved — the nav's section links looked dead.
 * 2. **Route changes.** Scroll position carried over between routes, so a teacher who read the
 *    landing page and then tapped Sign up arrived at /join already scrolled 723px down, with the
 *    form's heading 496px above the viewport. She never saw what she was filling in.
 *
 * Back and forward are deliberately left alone: on POP the browser restores the previous position,
 * and yanking to the top would be worse than the bug this fixes.
 */
export function useScrollOnNavigation(): void {
  const { hash, key, pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    // POP covers both the back/forward buttons and the very first render, where the browser is
    // already handling scroll correctly. A hash still needs resolving on a cold load, though.
    if (navigationType === 'POP' && !hash) return;

    // One frame of slack: on a cold load straight to /#how the route's element has not painted yet.
    const raf = requestAnimationFrame(() => {
      if (hash) {
        let id: string;
        try {
          id = decodeURIComponent(hash.slice(1));
        } catch {
          return; // a malformed escape sequence in the URL is not worth throwing over
        }
        if (!id) return;
        const el = document.getElementById(id);
        if (!el) return;
        // Prefer the enclosing section so the heading is not jammed against the viewport edge —
        // the section's top padding scrolls in with it.
        (el.closest('section') ?? el).scrollIntoView({ block: 'start' });
        return;
      }
      // Instant, not smooth: the page underneath has already been replaced, so animating a scroll
      // through content that is no longer there just looks broken.
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(raf);
  }, [hash, key, pathname, navigationType]);
}
