import { getCountries, getCountryCallingCode } from 'libphonenumber-js/max';

export interface CountryOption {
  code: string;        // ISO 3166-1 alpha-2 (plus AC/TA/XK which libphonenumber supports)
  name: string;        // English display name
  callingCode: string; // e.g. "91" (no '+')
}

export function buildCountryOptions(locale = 'en'): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' });
  const collator = new Intl.Collator(locale);
  return getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, callingCode: getCountryCallingCode(code) }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** Computed once at module load; served by GET /api/countries. */
export const COUNTRY_OPTIONS: CountryOption[] = buildCountryOptions();
