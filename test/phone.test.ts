import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../src/domain/phone.js';

describe('normalizePhone', () => {
  it('normalizes an Indian mobile typed in national format to E.164', () => {
    expect(normalizePhone('98765 43210', 'IN')).toEqual({ e164: '+919876543210' });
    expect(normalizePhone('098765-43210', 'IN')).toEqual({ e164: '+919876543210' }); // trunk 0 stripped
    expect(normalizePhone('98765 43210', 'in')).toEqual({ e164: '+919876543210' }); // lowercase country tolerated
  });
  it('rejects numbers that are too short, garbage, or for an unknown country', () => {
    expect(normalizePhone('12345', 'IN')).toEqual({ error: 'invalid' });
    expect(normalizePhone('abc', 'IN')).toEqual({ error: 'invalid' });
    expect(normalizePhone('', 'IN')).toEqual({ error: 'invalid' });
    expect(normalizePhone('98765 43210', 'XX')).toEqual({ error: 'invalid' });
    expect(normalizePhone('0123456789', 'IN')).toEqual({ error: 'invalid' }); // needs the /max metadata to catch
  });
  it('lets an explicit +<calling code> override the dropdown country', () => {
    expect(normalizePhone('+1 415 555 2671', 'IN')).toEqual({ e164: '+14155552671' });
    expect(normalizePhone('+91 98765 43210', 'US')).toEqual({ e164: '+919876543210' });
  });
  it('does not extract a number out of surrounding prose', () => {
    expect(normalizePhone('call me at 9876543210 pls', 'IN')).toEqual({ error: 'invalid' });
  });
  it('never throws on non-string input', () => {
    expect(normalizePhone(undefined as unknown as string, 'IN')).toEqual({ error: 'invalid' });
  });
});
