import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LandingV2 } from '../src/pages/LandingV2.tsx';

describe('LandingV2 (Trusted Teal alternate)', () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); sessionStorage.clear(); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); });

  it('renders the hero, the real Spark orb, and the primary CTA to /join', () => {
    render(<MemoryRouter><LandingV2 /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worksheets/i);
    expect(screen.getByRole('img', { name: /Spark/ })).toBeInTheDocument(); // the one animated hero orb
    expect(screen.getByRole('link', { name: /Get my first worksheet/ })).toHaveAttribute('href', '/join');
  });

  it('scopes itself under .landing-v2 and features the real trust signals', () => {
    const { container } = render(<MemoryRouter><LandingV2 /></MemoryRouter>);
    expect(container.querySelector('.landing-v2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Three steps, all inside WhatsApp/ })).toBeInTheDocument();
    expect(screen.getAllByText(/No student data, ever/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Built for my mother, a Sanskrit teacher/)).toBeInTheDocument();
    expect(screen.getByText(/18 teachers on the pilot/)).toBeInTheDocument();
  });

  it('tracks landing_view once per session and stores ?src=', () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/v2?src=grp-b']}><LandingV2 /></MemoryRouter>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).name).toBe('landing_view');
    expect(sessionStorage.getItem('ts_src')).toBe('grp-b');
    unmount();
    render(<MemoryRouter><LandingV2 /></MemoryRouter>);
    expect(fetchMock).toHaveBeenCalledTimes(1); // deduped within the tab session
  });
});
