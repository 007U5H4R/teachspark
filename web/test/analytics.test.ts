import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the SDK: we assert on how our wrapper drives it, never on real network calls.
const mp = { init: vi.fn(), register: vi.fn(), track: vi.fn() };
vi.mock('mixpanel-browser', () => ({ default: mp }));

// analytics.ts holds module-level `enabled` state, so each test re-imports a fresh copy.
async function freshModule() {
  vi.resetModules();
  return import('../src/lib/analytics.ts');
}

describe('analytics', () => {
  beforeEach(() => {
    mp.init.mockClear();
    mp.register.mockClear();
    mp.track.mockClear();
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is a no-op when VITE_MIXPANEL_TOKEN is unset', async () => {
    vi.stubEnv('VITE_MIXPANEL_TOKEN', '');
    const { initAnalytics, trackAnalytics } = await freshModule();
    expect(() => initAnalytics()).not.toThrow();
    expect(() => trackAnalytics('landing_view')).not.toThrow();
    expect(mp.init).not.toHaveBeenCalled();
    expect(mp.track).not.toHaveBeenCalled();
  });

  it('initialises the SDK against the US host (matches project data residency) and registers the visitor id', async () => {
    vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
    const { initAnalytics } = await freshModule();
    initAnalytics();
    expect(mp.init).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ api_host: 'https://api.mixpanel.com', track_pageview: false }),
    );
    expect(mp.register).toHaveBeenCalledWith(
      expect.objectContaining({ visitor_id: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    );
  });

  it('tracks events with props once initialised', async () => {
    vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
    const { initAnalytics, trackAnalytics } = await freshModule();
    initAnalytics();
    trackAnalytics('signup_completed', { signupId: 'sid_1', existing: false });
    expect(mp.track).toHaveBeenCalledWith('signup_completed', { signupId: 'sid_1', existing: false });
  });

  it('attaches the acquisition source (from saveSource) to every event', async () => {
    vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
    const { initAnalytics, trackAnalytics } = await freshModule();
    const { saveSource } = await import('../src/lib/session.ts');
    saveSource('ig_campaign');
    initAnalytics();
    trackAnalytics('landing_view');
    expect(mp.track).toHaveBeenCalledWith('landing_view', { source: 'ig_campaign' });
  });

  it('omits source when none was saved', async () => {
    vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
    const { initAnalytics, trackAnalytics } = await freshModule();
    initAnalytics();
    trackAnalytics('page_view', { path: '/' });
    expect(mp.track).toHaveBeenCalledWith('page_view', { path: '/' });
  });

  it('does not track before init (disabled by default)', async () => {
    vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-token');
    const { trackAnalytics } = await freshModule();
    trackAnalytics('join_tapped');
    expect(mp.track).not.toHaveBeenCalled();
  });
});
