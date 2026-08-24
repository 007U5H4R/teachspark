import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Spark, type SparkHandle } from '../components/spark/Spark.tsx';
import { GoogleContinue } from '../components/GoogleContinue.tsx';
import type { GoogleIdentity } from '../lib/googleAuth.ts';
import { ApiError, submitSignup, trackEvent } from '../lib/api.ts';
import { trackAnalytics } from '../lib/analytics.ts';
import { getVisitorId } from '../lib/visitor.ts';
import { loadSource, saveHandOff, type HandOff } from '../lib/session.ts';
import { validateSignupForm, type FieldErrors, type SignupFormValues } from '../lib/validate.ts';

const PROFESSION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'school_teacher', label: 'School teacher' },
  { value: 'tutor', label: 'Tutor / coaching' },
  { value: 'school_leader', label: 'Principal / school leader' },
  { value: 'teacher_trainer', label: 'Teacher trainer' },
  { value: 'parent', label: 'Parent' },
  { value: 'student', label: 'Student teacher' },
  { value: 'other', label: 'Other' },
];
const EMPTY: SignupFormValues = { name: '', profession: '', organization: '', city: '', email: '' };
const VIEWED = 'ts_sv'; // once-per-session guard for the signup_view funnel event

export function Join() {
  const navigate = useNavigate();
  const [values, setValues] = useState<SignupFormValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  // Set when the person used "Continue with Google": prefills the name and carries the email through.
  const [google, setGoogle] = useState<{ email: string; emailVerified: boolean } | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sparkRef = useRef<SparkHandle>(null);

  // The post-submit hand-off (setDone → 700ms → navigate) fires from a bare setTimeout, and
  // useNavigate's `navigate` stays callable after this component unmounts (it's bound to the
  // router context, not this instance). Without this, a user who leaves /join inside that window
  // gets silently yanked to /joined later. Clearing on unmount closes that hole.
  useEffect(() => () => { if (navTimerRef.current !== null) clearTimeout(navTimerRef.current); }, []);

  // "Reached the form" — the funnel step between a CTA tap and a submit. Session-guarded like
  // landing_view (Landing.tsx) so revisiting /join in one session doesn't inflate the count.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(VIEWED)) return;
      sessionStorage.setItem(VIEWED, '1');
    } catch {
      return; // storage blocked: skip rather than emit an uncapped event on every mount
    }
    trackEvent('signup_view');
  }, []);

  const set = (k: keyof SignupFormValues) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  // "Continue with Google" prefills the name (only if the field is still empty, so we never clobber
  // something the person already typed) and remembers the email to submit.
  const onGoogleIdentity = (id: GoogleIdentity) => {
    setValues((v) => ({ ...v, name: v.name.trim() ? v.name : id.name, email: id.email }));
    setErrors((er) => ({ ...er, name: undefined, email: undefined }));
    setGoogle({ email: id.email, emailVerified: id.emailVerified });
    sparkRef.current?.signal('success');
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    const fieldErrors = validateSignupForm(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) { sparkRef.current?.signal('error'); trackEvent('signup_failed', { reason: 'validation' }); return; }
    setBusy(true);
    sparkRef.current?.signal('thinking'); // sustained: released on whichever branch resolves below
    const method = google ? 'google' : 'manual';
    try {
      const email = google?.email ?? (values.email.trim() || undefined);
      const res = await submitSignup({
        name: values.name,
        profession: values.profession,
        organization: values.organization,
        city: values.city,
        method,
        ...(email ? { email } : {}),
        ...(google ? { emailVerified: google.emailVerified } : {}),
        visitorId: getVisitorId(),
        source: loadSource(),
        website: honeypot,
      });
      trackAnalytics('signup_completed', { signupId: res.signupId, existing: res.existing, method });
      const h: HandOff = { signupId: res.signupId, name: values.name.trim(), join: res.join };
      saveHandOff(h);
      setDone(true); // Spark beams for a beat before the hand-off screen
      sparkRef.current?.clear('thinking');
      sparkRef.current?.signal('success');
      navTimerRef.current = setTimeout(() => navigate('/joined', { state: h }), 700);
    } catch (err) {
      setBusy(false);
      sparkRef.current?.clear('thinking');
      sparkRef.current?.signal('error');
      if (err instanceof ApiError && err.status === 429) {
        trackEvent('signup_failed', { reason: 'rate_limited' });
        setBanner('Too many attempts from this network — please try again in a few minutes.');
      } else if (err instanceof ApiError && err.status === 400 && err.fields) {
        // The server can flag keys this form never renders (source, visitorId, website). Map only
        // the ones we have a field for, and fall back to the banner if none survive — otherwise
        // setErrors would silently store an error nothing displays, and the user sees no feedback
        // at all on the page the whole funnel converges on.
        trackEvent('signup_failed', { reason: 'bad_request' });
        const known = new Set(Object.keys(EMPTY));
        const mapped: FieldErrors = {};
        for (const [k, msgs] of Object.entries(err.fields)) if (known.has(k) && msgs[0]) mapped[k as keyof SignupFormValues] = msgs[0];
        if (Object.keys(mapped).length) setErrors(mapped);
        else setBanner("Something went wrong on our side. Please try again — if it keeps failing, message us and we'll add you by hand.");
      } else {
        trackEvent('signup_failed', { reason: 'error' });
        setBanner("Something went wrong on our side. Please try again — if it keeps failing, message us and we'll add you by hand.");
      }
    }
  }

  const field = (k: keyof SignupFormValues, label: string, input: ReactNode, required = true) => (
    <div className={`field${errors[k] ? ' field--error' : ''}`}>
      <label htmlFor={`f-${k}`}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>
      {input}
      {errors[k] && <span className="field__error" id={`e-${k}`}>{errors[k]}</span>}
    </div>
  );

  return (
    <main className="form">
      <div className="form__head">
        {/* Calm mode: this orb sits beside a form the teacher is filling in, so it tracks and
            blinks but never wanders, sleeps or gets curious. It still reacts to real events —
            thinking / success / error are signalled explicitly from onSubmit. */}
        <div style={{ width: 120, margin: '0 auto 8px' }}><Spark ref={sparkRef} expressive={false} mood={done ? 'happy' : 'default'} size={120} /></div>
        <h1>Join the TeachSpark pilot</h1>
        <p className="form__lead">Two quick details and we'll hand you the WhatsApp link. Takes 15 seconds — no number to type.</p>
      </div>
      <div className="form__panel">
      {banner && <div className="banner" role="alert">{banner}</div>}
      <GoogleContinue onIdentity={onGoogleIdentity} />
      {google && <p className="google-chip" role="status">Continuing as <strong>{google.email}</strong></p>}
      <form onSubmit={onSubmit} noValidate>
        <p className="form__req-note">* required</p>
        {field('name', 'Your name', <input id="f-name" name="name" autoComplete="name" aria-required="true" value={values.name} onChange={set('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'e-name' : undefined} />)}
        {field('profession', 'Profession', (
          <select id="f-profession" name="profession" aria-required="true" value={values.profession} onChange={set('profession')} aria-invalid={!!errors.profession} aria-describedby={errors.profession ? 'e-profession' : undefined}>
            <option value="">Choose…</option>
            {PROFESSION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {field('organization', 'School / organisation', <input id="f-organization" name="organization" autoComplete="organization" value={values.organization} onChange={set('organization')} />, false)}
        {field('city', 'City', <input id="f-city" name="city" autoComplete="address-level2" value={values.city} onChange={set('city')} />, false)}
        <div className="hp" aria-hidden="true">
          <label htmlFor="f-website">Website</label>
          <input id="f-website" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>
        <p className="consent">We'll only use this to connect you to TeachSpark on WhatsApp. No student data, ever.</p>
        <button type="submit" className="btn-submit" disabled={busy}>
          {busy ? <><span className="btn-submit__spinner" aria-hidden="true" />One moment…</> : 'Get my WhatsApp link'}
        </button>
      </form>
      </div>
    </main>
  );
}
