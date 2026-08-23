import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Joined } from '../src/pages/Joined.tsx';

const handoff = { signupId: 's1', name: 'Meera Iyer', join: { url: 'https://wa.me/14155238886?text=join%20captain-cheese', code: 'captain-cheese', whatsappNumber: '+14155238886' } };

function renderJoined(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/joined', state }]}>
      <Routes>
        <Route path="/joined" element={<Joined />} />
        <Route path="/join" element={<h1>JOIN PAGE</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Joined', () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); sessionStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); });

  it('redirects to /join when there is no hand-off', () => {
    renderJoined();
    expect(screen.getByText('JOIN PAGE')).toBeInTheDocument();
  });
  it('renders from router state when sessionStorage has nothing (e.g. storage is blocked)', () => {
    // sessionStorage.clear() in beforeEach leaves the store empty -- the same shape loadHandOff()
    // sees when Join.tsx's saveHandOff() throws (private mode / a WebView that blocks site data).
    // The router state Join.tsx passes to navigate() must be enough on its own.
    renderJoined(handoff);
    expect(screen.queryByText('JOIN PAGE')).not.toBeInTheDocument();
    const btn = screen.getByRole('link', { name: /Open WhatsApp & Join/ });
    expect(btn).toHaveAttribute('href', handoff.join.url);
  });
  it('ignores malformed router state and still redirects to /join when storage is empty', () => {
    renderJoined({ signupId: 'x' });
    expect(screen.getByText('JOIN PAGE')).toBeInTheDocument();
  });
  it('greets by name, shows the starry Spark, the wa.me button, the three steps and the manual fallback', () => {
    sessionStorage.setItem('ts_handoff', JSON.stringify(handoff));
    const { container } = renderJoined();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Meera/);
    expect(container.querySelector('.spark')).toHaveAttribute('data-state', 'starry');
    const btn = screen.getByRole('link', { name: /Open WhatsApp & Join/ });
    expect(btn).toHaveAttribute('href', handoff.join.url);
    expect(btn).toHaveAttribute('target', '_blank');
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    // Every occurrence of the join code across the steps + fallback must use the live, dynamic
    // code — never a hardcoded placeholder.
    expect(screen.getAllByText(/join captain-cheese/).length).toBeGreaterThanOrEqual(3); // step 1 + step 2 + manual fallback
    expect(screen.queryByText(/join x\b/)).not.toBeInTheDocument();
    // Chronological order: tap/open, send/enter, then type Hi.
    expect(steps[0]).toHaveTextContent(/Tap the green button/);
    expect(steps[0]).toHaveTextContent(/join captain-cheese/);
    expect(steps[1]).toHaveTextContent(/Send that message/);
    expect(steps[1]).toHaveTextContent(/join captain-cheese/);
    expect(steps[1]).toHaveTextContent(/connected/);
    expect(steps[2]).toHaveTextContent(/Hi/);
    expect(screen.getByText(/\+14155238886/)).toBeInTheDocument();
    expect(screen.getByText(/tap the button again/i)).toBeInTheDocument();
    // Safari strips the implicit list role when list-style: none is set; jsdom applies no CSS, so it
    // cannot reproduce that. We assert the explicit role="list" attribute the component ships instead.
    expect(container.querySelector('.steps')).toHaveAttribute('role', 'list');
  });
  it('tracks join_tapped with the signup id when the button is tapped', async () => {
    sessionStorage.setItem('ts_handoff', JSON.stringify(handoff));
    renderJoined();
    const btn = screen.getByRole('link', { name: /Open WhatsApp & Join/ });
    btn.addEventListener('click', (e) => e.preventDefault()); // jsdom: don't actually navigate
    await userEvent.click(btn);
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/events')!;
    expect(JSON.parse(call[1].body)).toMatchObject({ name: 'join_tapped', signupId: 's1' });
  });
});
