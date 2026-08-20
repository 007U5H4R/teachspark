import twilio from 'twilio'; // CommonJS package: default import, then destructure
import type { SendResult } from '../domain/types.js';
import type { Messenger } from '../ports.js';

const { RestException } = twilio;

export type TwilioClient = ReturnType<typeof twilio>;
export const MAX_BODY = 1500; // Twilio hard limit is 1600 (error 21617)

export interface TwilioMessengerOptions {
  accountSid: string;
  authToken: string;
  from: string; // "whatsapp:+14155238886" (sandbox)
  statusCallbackUrl?: string;
  client?: TwilioClient; // injectable for tests
}

export class TwilioMessenger implements Messenger {
  private readonly client: TwilioClient;

  constructor(private readonly opts: TwilioMessengerOptions) {
    this.client = opts.client ?? twilio(opts.accountSid, opts.authToken, { autoRetry: true, maxRetries: 3 });
  }

  async sendText(to: string, body: string): Promise<SendResult> {
    if (body.length > MAX_BODY) throw new Error(`message body too long (${body.length} > ${MAX_BODY})`);
    return this.send({ from: this.opts.from, to, body, ...this.callback() });
  }

  /** One media per WhatsApp message; Body is ignored for documents, so never pass it. */
  async sendDocument(to: string, url: string): Promise<SendResult> {
    return this.send({ from: this.opts.from, to, mediaUrl: [url], ...this.callback() });
  }

  private callback(): { statusCallback?: string } {
    return this.opts.statusCallbackUrl ? { statusCallback: this.opts.statusCallbackUrl } : {};
  }

  // If this Parameters<> type does not resolve, use: import type { MessageListInstanceCreateOptions } from 'twilio/lib/rest/api/v2010/account/message.js'
  private async send(params: Parameters<TwilioClient['messages']['create']>[0]): Promise<SendResult> {
    try {
      const m = await this.client.messages.create(params);
      return { ok: true, sid: m.sid, errorCode: null };
    } catch (err) {
      if (err instanceof RestException) {
        // 63016 outside 24h window · 63015 recipient not joined to sandbox · 21617 body too long
        console.error(`[twilio] ${err.code} (${err.status}): ${err.message}`);
        return { ok: false, sid: null, errorCode: typeof err.code === 'number' ? err.code : null };
      }
      throw err;
    }
  }
}
