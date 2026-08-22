// The landing-page deps every existing createApp() call site needs once AppDeps grew (Task 4).
import { InMemorySignupRepo, InMemoryWebEventLog } from '../../src/adapters/memory.js';
import type { JoinInfo } from '../../src/http/api.js';

export const TEST_JOIN: JoinInfo = { url: 'https://wa.me/14155238886?text=join%20test-code', code: 'test-code', whatsappNumber: '+14155238886' };

export function webDeps() {
  return { signups: new InMemorySignupRepo(), webEvents: new InMemoryWebEventLog(), join: TEST_JOIN, webDist: null as string | null };
}
