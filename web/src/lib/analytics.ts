import mixpanel from 'mixpanel-browser';
import clarity from '@microsoft/clarity';
import { getVisitorId } from './visitor.ts';
import { loadSource } from './session.ts';

// Data residency MUST match the Mixpanel project's region or /track returns status:1 while the
// events silently go nowhere. Project TeachSpark (id 4056855) is US residency → api.mixpanel.com.
// Verified 2026-08-24 via Project Settings → Data Residency: US.
const API_HOST = 'https://api.mixpanel.com';

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

/**
 * Boot Microsoft Clarity once, at app start — click/scroll heatmaps and (input-masked) session
 * replay, running alongside Mixpanel, not replacing it. A deliberate no-op when VITE_CLARITY_ID is
 * absent (dev, tests, token-less deploys). The project id is publishable, safe in the browser
 * bundle. Text/input masking is governed by the project's dashboard setting (Balanced by default),
 * which keeps the /join form's name/email/phone out of recordings.
 */
export function initClarity(): void {
  const projectId = import.meta.env.VITE_CLARITY_ID;
  if (!projectId) return;
  try {
    clarity.init(projectId);
    // Same cross-reference key as Mixpanel, so a Clarity session can be tied back to the first-party
    // /api/events funnel and /admin metrics by the one anonymous visitor id.
    clarity.setTag('visitor_id', getVisitorId());
  } catch {
    /* a blocked or failed SDK must never break the page */
  }
}

/** Fire-and-forget event. No-op until initAnalytics() has run with a token; never throws. */
export function trackAnalytics(name: string, props?: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    // Attach acquisition source at track-time, not init-time: initAnalytics() runs at boot, before
    // Landing.tsx reads ?source= and saveSource()s it, so registering it at init would miss it.
    const source = loadSource();
    mixpanel.track(name, source ? { ...props, source } : props);
  } catch {
    /* analytics must never break the page */
  }
}
