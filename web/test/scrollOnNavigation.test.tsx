import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router';
import userEvent from '@testing-library/user-event';
import { useScrollOnNavigation } from '../src/lib/scrollOnNavigation.ts';

// jsdom implements neither layout nor scrollIntoView, so we assert the calls rather than a
// scrollY value — the calls are the whole of what the hook is responsible for.
const intoView = vi.fn();
const scrollTo = vi.fn();

function Shell({ children }: { children?: React.ReactNode }) {
  useScrollOnNavigation();
  return (
    <>
      <Link to="/#how">How it works</Link>
      <Link to="/#why">Why teachers use it</Link>
      <Link to="/join">Sign up</Link>
      {children}
    </>
  );
}

function LandingStub() {
  return (
    <Shell>
      <section aria-labelledby="how"><h2 id="how">How it works</h2></section>
      <section aria-labelledby="why"><h2 id="why">Why teachers use it</h2></section>
      <h3 id="loose">No enclosing section</h3>
    </Shell>
  );
}

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<LandingStub />} />
        <Route path="/join" element={<Shell><h1>Join the TeachSpark pilot</h1></Shell>} />
      </Routes>
    </MemoryRouter>,
  );

describe('useScrollOnNavigation', () => {
  beforeEach(() => {
    intoView.mockClear();
    scrollTo.mockClear();
    Element.prototype.scrollIntoView = intoView;
    vi.stubGlobal('scrollTo', scrollTo);
    // The hook defers one frame so a cold load finds a painted element; run it immediately here.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('hash targets', () => {
    it('scrolls to the section when a nav link sets the hash — the reported bug', async () => {
      const user = userEvent.setup();
      renderAt('/');
      expect(intoView).not.toHaveBeenCalled();
      await user.click(screen.getByText('Why teachers use it', { selector: 'a' }));
      expect(intoView).toHaveBeenCalledTimes(1);
      // Prefers the enclosing <section> so the heading is not flush against the viewport edge.
      expect(intoView.mock.instances[0]).toBe(document.querySelector('section[aria-labelledby="why"]'));
    });

    it('resolves a hash on a cold load, which the browser cannot do for an SPA route', () => {
      renderAt('/#how');
      expect(intoView.mock.instances[0]).toBe(document.querySelector('section[aria-labelledby="how"]'));
    });

    it('scrolls again when the same link is clicked twice', async () => {
      // `hash` is unchanged on a repeat click, so depending on it alone would silently do nothing.
      const user = userEvent.setup();
      renderAt('/');
      const link = screen.getByText('How it works', { selector: 'a' });
      await user.click(link);
      await user.click(link);
      expect(intoView).toHaveBeenCalledTimes(2);
    });

    it('falls back to the element itself when it has no enclosing section', () => {
      renderAt('/#loose');
      expect(intoView.mock.instances[0]).toBe(document.getElementById('loose'));
    });

    it('does nothing for an unknown id or a malformed escape, and never throws', () => {
      expect(() => renderAt('/#nope')).not.toThrow();
      expect(() => renderAt('/#%E0%A4')).not.toThrow();
      expect(intoView).not.toHaveBeenCalled();
    });
  });

  describe('route changes', () => {
    it('scrolls to the top on a route change, so the form is not entered mid-page', async () => {
      // Without this a teacher who read the landing page and tapped Sign up arrived at /join
      // already scrolled down, with the form heading above the viewport.
      const user = userEvent.setup();
      renderAt('/');
      await user.click(screen.getByText('Sign up', { selector: 'a' }));
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
    });

    it('does not scroll on the initial render', () => {
      renderAt('/');
      expect(scrollTo).not.toHaveBeenCalled();
      expect(intoView).not.toHaveBeenCalled();
    });

    it('uses an instant scroll, not a smooth one', async () => {
      // html { scroll-behavior: smooth } is set globally for in-page anchors. Inheriting it here
      // would animate a scroll through content that has already been replaced.
      const user = userEvent.setup();
      renderAt('/');
      await user.click(screen.getByText('Sign up', { selector: 'a' }));
      expect(scrollTo.mock.calls[0]![0]).toHaveProperty('behavior', 'instant');
    });
  });
});
