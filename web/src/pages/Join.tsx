import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Spark, type SparkHandle } from '../components/spark/Spark.tsx';
import { ApiError, fetchCountries, submitSignup, type CountryOption } from '../lib/api.ts';
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
const FALLBACK_COUNTRIES: CountryOption[] = [{ code: 'IN', name: 'India', callingCode: '91' }];
const EMPTY: SignupFormValues = { name: '', profession: '', organization: '', phone: '', city: '', country: 'IN' };

export function Join() {
  const navigate = useNavigate();
  const [values, setValues] = useState<SignupFormValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [countries, setCountries] = useState<CountryOption[]>(FALLBACK_COUNTRIES);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sparkRef = useRef<SparkHandle>(null);

  useEffect(() => {
    let alive = true;
    fetchCountries().then((list) => { if (alive && list.length) setCountries(list); }).catch(() => { /* keep the fallback */ });
    return () => { alive = false; };
  }, []);

  // The post-submit hand-off (setDone → 700ms → navigate) fires from a bare setTimeout, and
  // useNavigate's `navigate` stays callable after this component unmounts (it's bound to the
  // router context, not this instance). Without this, a user who leaves /join inside that window
  // gets silently yanked to /joined later. Clearing on unmount closes that hole.
  useEffect(() => () => { if (navTimerRef.current !== null) clearTimeout(navTimerRef.current); }, []);

  const callingCode = countries.find((c) => c.code === values.country)?.callingCode ?? '';
  const set = (k: keyof SignupFormValues) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    const fieldErrors = validateSignupForm(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) { sparkRef.current?.signal('error'); return; }
    setBusy(true);
    sparkRef.current?.signal('thinking'); // sustained: released on whichever branch resolves below
    try {
      const res = await submitSignup({ ...values, visitorId: getVisitorId(), source: loadSource(), website: honeypot });
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
      if (err instanceof ApiError && err.status === 422) {
        setErrors({ phone: "That doesn't look like a valid WhatsApp number for the selected country" });
      } else if (err instanceof ApiError && err.status === 429) {
        setBanner('Too many attempts from this network — please try again in a few minutes.');
      } else if (err instanceof ApiError && err.status === 400 && err.fields) {
        // The server can flag keys this form never renders (source, visitorId, website). Map only
        // the ones we have a field for, and fall back to the banner if none survive — otherwise
        // setErrors would silently store an error nothing displays, and the user sees no feedback
        // at all on the page the whole funnel converges on.
        const known = new Set(Object.keys(EMPTY));
        const mapped: FieldErrors = {};
        for (const [k, msgs] of Object.entries(err.fields)) if (known.has(k) && msgs[0]) mapped[k as keyof SignupFormValues] = msgs[0];
        if (Object.keys(mapped).length) setErrors(mapped);
        else setBanner("Something went wrong on our side. Please try again — if it keeps failing, message us and we'll add you by hand.");
      } else {
        setBanner("Something went wrong on our side. Please try again — if it keeps failing, message us and we'll add you by hand.");
      }
    }
  }

  const field = (k: keyof SignupFormValues, label: string, input: ReactNode) => (
    <div className={`field${errors[k] ? ' field--error' : ''}`}>
      <label htmlFor={`f-${k}`}>{label}</label>
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
        <p className="form__lead">Tell us a little about yourself and we'll hand you the WhatsApp link. Takes 30 seconds.</p>
      </div>
      <div className="form__panel">
      {banner && <div className="banner" role="alert">{banner}</div>}
      <form onSubmit={onSubmit} noValidate>
        {field('name', 'Your name', <input id="f-name" name="name" autoComplete="name" value={values.name} onChange={set('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'e-name' : undefined} />)}
        {field('profession', 'Profession', (
          <select id="f-profession" name="profession" value={values.profession} onChange={set('profession')} aria-invalid={!!errors.profession} aria-describedby={errors.profession ? 'e-profession' : undefined}>
            <option value="">Choose…</option>
            {PROFESSION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {field('organization', 'School / organisation (optional)', <input id="f-organization" name="organization" autoComplete="organization" value={values.organization} onChange={set('organization')} />)}
        {field('country', 'Country', (
          <select id="f-country" name="country" autoComplete="country" value={values.country} onChange={set('country')} aria-invalid={!!errors.country} aria-describedby={errors.country ? 'e-country' : undefined}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name} (+{c.callingCode})</option>)}
          </select>
        ))}
        {field('phone', 'WhatsApp number', (
          <div className="phone">
            <span className="phone__cc" aria-hidden="true">+{callingCode}</span>
            <input id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" value={values.phone} onChange={set('phone')} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'e-phone' : undefined} />
          </div>
        ))}
        {field('city', 'City', <input id="f-city" name="city" autoComplete="address-level2" value={values.city} onChange={set('city')} aria-invalid={!!errors.city} aria-describedby={errors.city ? 'e-city' : undefined} />)}
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
