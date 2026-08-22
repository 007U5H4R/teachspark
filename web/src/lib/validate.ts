export interface SignupFormValues { name: string; profession: string; organization: string; phone: string; city: string; country: string }
export type FieldErrors = Partial<Record<keyof SignupFormValues, string>>;

export const phoneDigits = (raw: string): string => raw.replace(/\D/g, '');

/** Cheap client-side checks for instant feedback. The server's normalizePhone() is the source of truth. */
export function validateSignupForm(v: SignupFormValues): FieldErrors {
  const e: FieldErrors = {};
  if (v.name.trim().length < 2) e.name = 'Please enter your name';
  if (!v.profession) e.profession = 'Please pick one';
  const digits = phoneDigits(v.phone);
  if (digits.length < 6 || digits.length > 15) e.phone = 'Please enter a valid WhatsApp number';
  if (v.city.trim().length < 2) e.city = 'Please enter your city';
  if (!/^[A-Za-z]{2}$/.test(v.country)) e.country = 'Please pick your country';
  return e;
}
