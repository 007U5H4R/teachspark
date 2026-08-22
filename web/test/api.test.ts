import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, fetchCountries, submitSignup, trackEvent } from '../src/lib/api.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const req = { name: 'M', profession: 'tutor', organization: '', phone: '9876543210', city: 'Pune', country: 'IN', visitorId: 'v', website: '' };

describe('api client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

  it('submitSignup posts JSON and returns the parsed body', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { signupId: 's1', existing: false, join: { url: 'u', code: 'c', whatsappNumber: '+1' } }));
    const res = await submitSignup(req);
    expect(res.signupId).toBe('s1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/signup');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(req);
  });
  it('throws ApiError with status, code and field errors', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: 'bad_request', fields: { name: ['Please enter your name'] } }));
    const err = await submitSignup(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).code).toBe('bad_request');
    expect((err as ApiError).fields).toEqual({ name: ['Please enter your name'] });
  });
  it('tolerates a non-JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 502 }));
    const err = await submitSignup(req).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe('http_error');
  });
  it('fetchCountries unwraps the list', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { countries: [{ code: 'IN', name: 'India', callingCode: '91' }] }));
    expect(await fetchCountries()).toEqual([{ code: 'IN', name: 'India', callingCode: '91' }]);
  });
  it('trackEvent fires a keepalive POST with the visitor id and never throws', async () => {
    // trackEvent (web/src/lib/api.ts) returns void, not a promise: it is fire-and-forget, so a
    // synchronous not.toThrow() around the call proves nothing about the rejected fetch promise it
    // kicks off -- and Node/jsdom's unhandled-rejection tracking can't be used to check this either,
    // because Vitest's own mock bookkeeping attaches a handler to every mocked return value
    // regardless of what the code under test does (verified empirically). Instrument .catch on this
    // one promise instance instead, so we observe directly whether trackEvent's own
    // fetch(...).catch(...) actually runs -- that is what stands between a network failure and an
    // uncaught rejection here.
    const rejection: Promise<never> = Promise.reject(new Error('offline'));
    let caught = false;
    const realCatch = rejection.catch.bind(rejection);
    (rejection as { catch: unknown }).catch = (onRejected?: ((reason: unknown) => unknown) | null) => {
      caught = true;
      return realCatch(onRejected as never);
    };
    fetchMock.mockImplementationOnce(() => rejection);

    expect(() => trackEvent('join_tapped', 's1')).not.toThrow();
    expect(caught).toBe(true);
    await rejection.catch(() => {}); // drain it through the real handler so nothing leaks as unhandled

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/events');
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body);
    const storedVisitorId = localStorage.getItem('ts_visitor');
    expect(storedVisitorId).not.toBeNull();
    expect(body.visitorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toEqual({ visitorId: storedVisitorId, name: 'join_tapped', signupId: 's1' });
  });
});
