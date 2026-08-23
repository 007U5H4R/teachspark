import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Join } from '../src/pages/Join.tsx';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const countries = { countries: [{ code: 'IN', name: 'India', callingCode: '91' }, { code: 'US', name: 'United States', callingCode: '1' }] };
const success = { signupId: 's1', existing: false, join: { url: 'https://wa.me/14155238886?text=join%20x', code: 'x', whatsappNumber: '+14155238886' } };

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

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Your name/), 'Meera Iyer');
  await user.selectOptions(screen.getByLabelText(/Profession/), 'school_teacher');
  await user.type(screen.getByLabelText(/School/), 'DPS Pune');
  await user.type(screen.getByLabelText(/WhatsApp number/), '98765 43210');
  await user.type(screen.getByLabelText(/City/), 'Pune');
}

describe('Join', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    sessionStorage.clear(); localStorage.clear();
    fetchMock.mockImplementation((url: string) => Promise.resolve(url === '/api/countries' ? json(200, countries) : json(201, success)));
  });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

  it('renders all fields, the consent line, the honeypot, and loads the country list (India preselected)', async () => {
    renderJoin();
    expect(screen.getByLabelText(/Your name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Profession/)).toBeInTheDocument();
    expect(screen.getByLabelText(/School/)).toBeInTheDocument();
    expect(screen.getByLabelText(/WhatsApp number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/City/)).toBeInTheDocument();
    expect(screen.getByText(/No student data, ever/)).toBeInTheDocument();
    // Required fields are starred; organization is the one unmarked (optional) field.
    for (const label of [/Your name/, /Profession/, /Country/, /WhatsApp number/, /City/]) {
      expect(screen.getByLabelText(label).closest('.field')?.querySelector('label .req')).toBeInTheDocument();
    }
    const orgLabel = screen.getByText(/School \/ organisation/);
    expect(orgLabel.textContent).not.toMatch(/optional/i);
    expect(orgLabel.querySelector('.req')).toBeNull();
    expect(screen.getByText('* required')).toBeInTheDocument();
    expect(document.querySelector('input[name="website"]')).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(screen.getByRole('option', { name: /United States/ })).toBeInTheDocument());
    expect(screen.getByLabelText(/Country/)).toHaveValue('IN');
    expect(screen.getByText('+91')).toBeInTheDocument();
  });
  it('shows inline errors and does not call the API when the form is invalid', async () => {
    const user = userEvent.setup();
    renderJoin();
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    expect(await screen.findByText('Please enter your name')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/signup')).toHaveLength(0);
  });
  it('submits, saves the hand-off, shows a happy Spark, then navigates to /joined', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('ts_src', 'grp-a');
    const { container } = renderJoin();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    await waitFor(() => expect(container.querySelector('.spark')).toHaveAttribute('data-state', 'happy'));
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/signup')!;
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ name: 'Meera Iyer', profession: 'school_teacher', organization: 'DPS Pune', phone: '98765 43210', city: 'Pune', country: 'IN', source: 'grp-a', website: '' });
    expect(body.visitorId).toBe(localStorage.getItem('ts_visitor'));
    expect(JSON.parse(sessionStorage.getItem('ts_handoff')!)).toEqual({ signupId: 's1', name: 'Meera Iyer', join: success.join });
    // real timers: the page navigates 700 ms after success
    expect(await screen.findByText('JOINED PAGE', {}, { timeout: 3000 })).toBeInTheDocument();
  });
  it('maps a 422 to a phone field error and a 429 to a banner', async () => {
    const user = userEvent.setup();
    renderJoin();
    await fillValid(user);
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(422, { error: 'invalid_phone' })));
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    expect(await screen.findByText(/doesn't look like a valid WhatsApp number/)).toBeInTheDocument();
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(429, { error: 'rate_limited' })));
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many attempts/);
  });
  it('falls back to the generic banner when a 400 field-error key has no matching form field', async () => {
    // The server can flag keys this form never renders (source, visitorId, website). Regression
    // pin for fix-round item 3: an unmapped key must not disappear into `errors` with nothing
    // on screen to show it — it must fall back to the banner.
    const user = userEvent.setup();
    renderJoin();
    await fillValid(user);
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(400, { error: 'validation_error', fields: { visitorId: ['bad visitor id'] } })));
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Something went wrong on our side/);
  });
  it('clears the post-submit navigation timer on unmount so a stray navigate never fires later', async () => {
    // Regression pin for fix-round item 1. Correlate by the 700 ms delay (the only setTimeout in
    // this tree that uses it — Spark's own blink timers use 140 ms and a random 3-6 s cadence) so
    // Spark's unrelated clearTimeout-on-unmount calls can't produce a false pass.
    const user = userEvent.setup();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = renderJoin();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    await waitFor(() => expect(setTimeoutSpy.mock.calls.some((c) => c[1] === 700)).toBe(true));
    const navCallIndex = setTimeoutSpy.mock.calls.findIndex((c) => c[1] === 700);
    const navTimerId = setTimeoutSpy.mock.results[navCallIndex]?.value;
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(navTimerId);
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });
});
