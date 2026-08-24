import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

// Stand in for the real GIS button: a plain button that emits a decoded identity on click, so we can
// test how Join integrates the Google fast-path without loading Google Identity Services.
vi.mock('../src/components/GoogleContinue.tsx', () => ({
  GoogleContinue: ({ onIdentity }: { onIdentity: (id: { name: string; email: string; emailVerified: boolean }) => void }) => (
    <button type="button" onClick={() => onIdentity({ name: 'Gmail Name', email: 'g@gmail.com', emailVerified: true })}>MOCK GOOGLE</button>
  ),
}));

import { Join } from '../src/pages/Join.tsx';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const success = { signupId: 's1', existing: false, join: { url: 'https://wa.me/1?text=join%20x', code: 'x', whatsappNumber: '+1' } };

function renderJoin() {
  return render(
    <MemoryRouter initialEntries={['/join']}>
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route path="/joined" element={<h1>JOINED PAGE</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Join — Google fast-path', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    sessionStorage.clear(); localStorage.clear();
    fetchMock.mockImplementation(() => Promise.resolve(json(201, success)));
  });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

  it('prefills the name, shows the email chip, and submits method=google with the email', async () => {
    const user = userEvent.setup();
    renderJoin();
    await user.click(screen.getByRole('button', { name: 'MOCK GOOGLE' }));
    // Name prefilled from the identity; email surfaced as a confirmation chip.
    expect(screen.getByLabelText(/Your name/)).toHaveValue('Gmail Name');
    expect(screen.getByText(/Continuing as/)).toHaveTextContent('g@gmail.com');
    // Profession is still required.
    await user.selectOptions(screen.getByLabelText(/Profession/), 'tutor');
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/signup')).toBe(true));
    const body = JSON.parse(fetchMock.mock.calls.find((c) => c[0] === '/api/signup')![1].body);
    expect(body).toMatchObject({ name: 'Gmail Name', profession: 'tutor', method: 'google', email: 'g@gmail.com', emailVerified: true });
  });

  it('does not clobber a name the person already typed', async () => {
    const user = userEvent.setup();
    renderJoin();
    await user.type(screen.getByLabelText(/Your name/), 'Typed First');
    await user.click(screen.getByRole('button', { name: 'MOCK GOOGLE' }));
    expect(screen.getByLabelText(/Your name/)).toHaveValue('Typed First');
  });
});
