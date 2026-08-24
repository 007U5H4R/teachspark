import mixpanel from 'mixpanel-browser';
import { getVisitorId } from './visitor.ts';

// Data residency: this project lives in Mixpanel's India region, so events MUST go to the India
// ingestion host — the default (US) host silently drops them. See brainstorming decision 2026-08-24.
const API_HOST = 'https://api-in.mixpanel.com';

// Off until initAnalytics() succeeds. Keeps every track call a no-op in dev, tests, and any deploy
// that ships without a token, so analytics can never throw into the page.
let enabled = false;

/**
 * Boot Mixpanel once, at app start. When VITE_MIXPANEL_TOKEN is absent this is a deliberate no-op:
 * nothing initialises and no events are sent. The token is a publishable client token, safe to ship
 * in the browser bundle (Vite inlines VITE_* at build time).
 */
export function initAnalytics(): void {
  const token = import.meta.env.VITE_MIXPANEL_TOKEN;
  if (!token) return;
  try {
    mixpanel.init(token, {
      api_host: API_HOST,
      persistence: 'localStorage', // no analytics cookies; matches how visitor.ts already stores its id
      track_pageview: false, // App.tsx tracks navigations explicitly so SPA route changes are counted
    });
    // Cross-reference key: ties Mixpanel events back to the same anonymous id the first-party
    // /api/events funnel and /admin/metrics use.
    mixpanel.register({ visitor_id: getVisitorId() });
    enabled = true;
  } catch {
    enabled = false; // a bad token or blocked SDK must not break the app
  }
}

/** Fire-and-forget event. No-op until initAnalytics() has run with a token; never throws. */
export function trackAnalytics(name: string, props?: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    mixpanel.track(name, props);
  } catch {
    /* analytics must never break the page */
  }
}
