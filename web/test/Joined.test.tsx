import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Joined } from '../src/pages/Joined.tsx';

const handoff = { signupId: 's1', name: 'Meera Iyer', join: { url: 'https://wa.me/14155238886?text=join%20captain-cheese', code: 'captain-cheese', whatsappNumber: '+14155238886' } };

function renderJoined() {
  return render(
    <MemoryRouter initialEntries={['/joined']}>
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
  it('greets by name, shows the starry Spark, the wa.me button, the three steps and the manual fallback', () => {
    sessionStorage.setItem('ts_handoff', JSON.stringify(handoff));
    const { container } = renderJoined();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Meera/);
    expect(container.querySelector('.spark')).toHaveAttribute('data-state', 'starry');
    const btn = screen.getByRole('link', { name: /Open WhatsApp & Join/ });
    expect(btn).toHaveAttribute('href', handoff.join.url);
    expect(btn).toHaveAttribute('target', '_blank');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByText(/join captain-cheese/)).toHaveLength(2); // step 1 + manual fallback
    expect(screen.getByText(/\+14155238886/)).toBeInTheDocument();
    expect(screen.getByText(/tap the button again/i)).toBeInTheDocument();
    // list-style: none strips implicit role in jsdom—we verify the attribute instead of role query
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
