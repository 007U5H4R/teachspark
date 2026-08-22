import { describe, it, expect } from 'vitest';
import { showSignupCta } from '../src/lib/nav.ts';

describe('showSignupCta', () => {
  it('shows the CTA on marketing surfaces only', () => {
    expect(showSignupCta('/')).toBe(true);
    expect(showSignupCta('/anything-else')).toBe(true);
    expect(showSignupCta('/join')).toBe(false);
    expect(showSignupCta('/joined')).toBe(false);
    expect(showSignupCta('/admin')).toBe(false);
    expect(showSignupCta('/admin/metrics')).toBe(false);
  });
  it('does not false-match paths that merely start with /admin', () => {
    expect(showSignupCta('/admins')).toBe(true);
    expect(showSignupCta('/administrator')).toBe(true);
    expect(showSignupCta('/admin-guide')).toBe(true);
    expect(showSignupCta('/admin')).toBe(false);
    expect(showSignupCta('/admin/metrics')).toBe(false);
  });
});
