import '@testing-library/jest-dom/vitest';

// DELIBERATE: `window.matchMedia` is left UNDEFINED here. jsdom does not implement it, and we do
// not polyfill it. Spark's gaze effect opens with `typeof window.matchMedia !== 'function'` and
// early-returns, so under test it registers no pointer listener, no IntersectionObserver and no
// requestAnimationFrame loop. That is the design, not an oversight.
//
// Do NOT add the common Testing Library matchMedia mock. It would:
//   1. Disable this project's real verification path. The gaze maths is covered pure and DOM-free
//      by test/eyes.test.ts; the browser behaviour is verified with a throwaway probe that stubs
//      matchMedia, runs, and is deleted in the same command (see the Task 8 report). A permanent
//      mock here makes the suite *look* like it exercises tracking while jsdom — which has no
//      layout, so every getBoundingClientRect is 0×0 — silently asserts nothing.
//   2. Break the blink test. With matchMedia present the rAF loop starts, and
//      `vi.advanceTimersByTime(1000)` would then synchronously drive ~60 gaze frames inside
//      act(), because Vitest's fake timers fake requestAnimationFrame too.
