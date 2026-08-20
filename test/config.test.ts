import { describe, it, expect } from 'vitest';
import { loadConfig, buildJoinLink } from '../src/config.js';

const valid = {
  PUBLIC_BASE_URL: 'https://x.ngrok-free.app',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_SANDBOX_JOIN_CODE: 'clever-tiger',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  ADMIN_TOKEN: 'admin-token-123',
  CRON_SECRET: 'cron-secret-123',
};

describe('loadConfig', () => {
  it('parses a valid env and applies defaults', () => {
    const c = loadConfig(valid);
    expect(c.PORT).toBe(3000);
    expect(c.NODE_ENV).toBe('development');
    expect(c.TWILIO_WHATSAPP_FROM).toBe('whatsapp:+14155238886');
    expect(c.TWILIO_VALIDATE_SIGNATURE).toBe(true);
    expect(c.WORKSHEET_MODEL).toBe('claude-sonnet-5');
    expect(c.SUPABASE_PDF_BUCKET).toBe('worksheets');
    expect(c.NUDGE_TIMEZONE).toBe('Asia/Kolkata');
    expect(c.NUDGE_CRON).toBe('*/10 * * * *');
  });
  it('coerces PORT and boolean flags', () => {
    const c = loadConfig({ ...valid, PORT: '8080', TWILIO_VALIDATE_SIGNATURE: 'false' });
    expect(c.PORT).toBe(8080);
    expect(c.TWILIO_VALIDATE_SIGNATURE).toBe(false);
  });
  it('throws naming the missing variable', () => {
    const { ANTHROPIC_API_KEY: _omit, ...rest } = valid;
    expect(() => loadConfig(rest)).toThrow(/ANTHROPIC_API_KEY/);
  });
  it('rejects a PUBLIC_BASE_URL with a trailing slash', () => {
    expect(() => loadConfig({ ...valid, PUBLIC_BASE_URL: 'https://x.ngrok-free.app/' })).toThrow(/trailing slash/);
  });
});

describe('buildJoinLink', () => {
  it('builds a wa.me link with the pre-filled join message', () => {
    expect(buildJoinLink('whatsapp:+14155238886', 'clever-tiger')).toBe(
      'https://wa.me/14155238886?text=join%20clever-tiger',
    );
  });
});
