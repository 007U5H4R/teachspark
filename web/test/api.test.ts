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
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(() => trackEvent('join_tapped', 's1')).not.toThrow();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/events');
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body);
    expect(body).toEqual({ visitorId: localStorage.getItem('ts_visitor'), name: 'join_tapped', signupId: 's1' });
  });
});
