// The /max build is the only one whose isValid() checks national digit patterns: the default (/min)
// build is length-only and accepts e.g. 0123456789 for IN. Size is irrelevant on the server.
import { parsePhoneNumberFromString, isSupportedCountry } from 'libphonenumber-js/max';

export type NormalizePhoneResult = { e164: string } | { error: 'invalid' };

/**
 * @param raw     What the teacher typed: national format, or international with '+'. Spaces/dashes/brackets OK.
 * @param country ISO 3166-1 alpha-2 from the dropdown, e.g. 'IN'. A leading +<calling code> in raw wins over it.
 */
export function normalizePhone(raw: string, country: string): NormalizePhoneResult {
  if (typeof raw !== 'string' || typeof country !== 'string') return { error: 'invalid' }; // lib throws on non-strings
  const cc = country.toUpperCase();
  if (!isSupportedCountry(cc)) return { error: 'invalid' };
  // extract:false -- a form field is not prose; never pull a number out of "call me at 98765…"
  const parsed = parsePhoneNumberFromString(raw, { defaultCountry: cc, extract: false });
  if (!parsed || !parsed.isValid()) return { error: 'invalid' }; // '12345' returns an object with isValid() === false
  return { e164: parsed.number };
}
