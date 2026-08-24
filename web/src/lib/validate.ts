// The form no longer collects a WhatsApp number or country: the bot gets the number from Twilio on
// the first message, so we only ask for the minimum. City and organisation are optional; email is
// carried when the Google fast-path fills it in.
export interface SignupFormValues { name: string; profession: string; organization: string; city: string; email: string }
export type FieldErrors = Partial<Record<keyof SignupFormValues, string>>;

/** Cheap client-side checks for instant feedback. The server (Zod) is the source of truth. */
export function validateSignupForm(v: SignupFormValues): FieldErrors {
  const e: FieldErrors = {};
  if (v.name.trim().length < 2) e.name = 'Please enter your name';
  if (!v.profession) e.profession = 'Please pick one';
  // Email is optional (only set via Continue with Google), but if present it must look valid.
  if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) e.email = 'Please enter a valid email';
  return e;
}
