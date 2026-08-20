import { describe, it, expect, vi } from 'vitest';
import twilio from 'twilio';
import { TwilioMessenger, MAX_BODY, type TwilioClient } from '../src/adapters/twilio.js';

function fakeTwilio(impl: (params: Record<string, unknown>) => Promise<unknown>) {
  const create = vi.fn(impl);
  return { client: { messages: { create } } as unknown as TwilioClient, create };
}
const opts = { accountSid: 'AC1', authToken: 'tok', from: 'whatsapp:+14155238886', statusCallbackUrl: 'https://x.test/webhooks/twilio/status' };

describe('TwilioMessenger', () => {
  it('sends text with from/to/body/statusCallback and returns the sid', async () => {
    const { client, create } = fakeTwilio(async () => ({ sid: 'SM123' }));
    const m = new TwilioMessenger({ ...opts, client });
    expect(await m.sendText('whatsapp:+911', 'hello')).toEqual({ ok: true, sid: 'SM123', errorCode: null });
    expect(create).toHaveBeenCalledWith({ from: 'whatsapp:+14155238886', to: 'whatsapp:+911', body: 'hello', statusCallback: 'https://x.test/webhooks/twilio/status' });
  });
  it('sends a document with mediaUrl only (no body — WhatsApp ignores captions on documents)', async () => {
    const { client, create } = fakeTwilio(async () => ({ sid: 'SM9' }));
    const m = new TwilioMessenger({ ...opts, client });
    await m.sendDocument('whatsapp:+911', 'https://x.test/a.pdf');
    const params = create.mock.calls[0][0] as Record<string, unknown>;
    expect(params.mediaUrl).toEqual(['https://x.test/a.pdf']);
    expect(params).not.toHaveProperty('body');
  });
  it('refuses bodies over MAX_BODY', async () => {
    const { client } = fakeTwilio(async () => ({ sid: 'SM1' }));
    const m = new TwilioMessenger({ ...opts, client });
    await expect(m.sendText('whatsapp:+911', 'x'.repeat(MAX_BODY + 1))).rejects.toThrow(/too long/);
  });
  it('maps Twilio RestException to {ok:false, errorCode} instead of throwing', async () => {
    const err = Object.assign(Object.create(twilio.RestException.prototype), { code: 63016, status: 400, message: 'Outside messaging window', moreInfo: '' });
    const { client } = fakeTwilio(async () => { throw err; });
    const m = new TwilioMessenger({ ...opts, client });
    expect(await m.sendText('whatsapp:+911', 'late')).toEqual({ ok: false, sid: null, errorCode: 63016 });
  });
  it('rethrows non-Twilio errors', async () => {
    const { client } = fakeTwilio(async () => { throw new Error('network'); });
    const m = new TwilioMessenger({ ...opts, client });
    await expect(m.sendText('whatsapp:+911', 'x')).rejects.toThrow('network');
  });
});
