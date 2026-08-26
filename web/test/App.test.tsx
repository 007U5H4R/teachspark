import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App.tsx';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    localStorage.clear();
    localStorage.setItem('ts_variant', 'A'); // pin the A/B bucket to the original landing for these assertions
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders the landing page on / with the nav CTA', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worksheets/i);
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });
  it('falls back to the landing page for unknown routes', () => {
    render(<MemoryRouter initialEntries={['/nope']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worksheets/i);
  });

  it('serves the /v2 redesign at "/" for the B bucket, with its own chrome (no global Sign up)', () => {
    localStorage.setItem('ts_variant', 'B');
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    // LandingV2-only content confirms B rendered at "/"…
    expect(screen.getByText(/Built for my mother, a Sanskrit teacher/)).toBeInTheDocument();
    // …and the global dark nav (its "Sign up" CTA) is suppressed in favour of LandingV2's own chrome.
    expect(screen.queryByRole('link', { name: 'Sign up' })).not.toBeInTheDocument();
  });
});
