import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminError, fetchMetrics, hasSession, login, logout, type AdminMetrics, type Tally } from '../lib/adminApi.ts';
import { IndiaMap } from '../components/IndiaMap/IndiaMap.tsx';

type View =
  | { kind: 'checking' }                       // deciding whether a session already exists
  | { kind: 'login'; error?: string; busy?: boolean }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: AdminMetrics };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="stat">
      <p className="stat__value">{value}</p>
      <p className="stat__label">{label}</p>
      {hint && <p className="stat__hint">{hint}</p>}
    </div>
  );
}

/** Simple proportional bars. A charting dependency for a handful of counts is bytes for nothing. */
function Bars({ title, rows, empty }: { title: string; rows: Tally[]; empty: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <section className="panel">
      <h3 className="panel__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="panel__empty">{empty}</p>
      ) : (
        <ul className="bars" role="list">
          {rows.map((r) => (
            <li key={r.name} className="bar">
              <span className="bar__name">{r.name.replace(/_/g, ' ')}</span>
              <span className="bar__track"><span className="bar__fill" style={{ width: `${max ? (r.count / max) * 100 : 0}%` }} /></span>
              <span className="bar__count">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Admin() {
  const [view, setView] = useState<View>({ kind: 'checking' });
  const [token, setToken] = useState('');

  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    try {
      setView({ kind: 'ready', data: await fetchMetrics() });
    } catch (err) {
      if (err instanceof AdminError && err.status === 401) { setView({ kind: 'login' }); return; }
      setView({ kind: 'error', message: "Couldn't load the metrics." });
    }
  }, []);

  useEffect(() => { void (async () => (await hasSession()) ? load() : setView({ kind: 'login' }))(); }, [load]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setView({ kind: 'login', busy: true });
    try {
      await login(token);
      setToken(''); // do not leave it sitting in component state after it has been exchanged
      await load();
    } catch (err) {
      const rate = err instanceof AdminError && err.status === 429;
      setView({ kind: 'login', error: rate ? 'Too many attempts. Try again in a few minutes.' : 'That token was not accepted.' });
    }
  }

  async function onLogout() {
    await logout().catch(() => {});
    setView({ kind: 'login' });
  }

  if (view.kind === 'checking') {
    return <main className="admin"><p className="admin__muted" role="status">Checking your session…</p></main>;
  }

  if (view.kind === 'login') {
    return (
      <main className="admin admin--login">
        <h1>Admin</h1>
        <p className="admin__muted">Enter the admin token to view the dashboard.</p>
        <form className="admin__login" onSubmit={onLogin}>
          {view.error && <div className="banner" role="alert">{view.error}</div>}
          <div className="field">
            <label htmlFor="admin-token">Admin token</label>
            <input id="admin-token" name="token" type="password" autoComplete="current-password"
              value={token} onChange={(e) => setToken(e.target.value)} disabled={view.busy} />
          </div>
          <button type="submit" className="btn-submit" disabled={view.busy || token.length === 0}>
            {view.busy ? <><span className="btn-submit__spinner" aria-hidden="true" />Checking…</> : 'Sign in'}
          </button>
        </form>
      </main>
    );
  }

  if (view.kind === 'loading') {
    return <main className="admin"><p className="admin__muted" role="status">Loading metrics…</p></main>;
  }

  if (view.kind === 'error') {
    return (
      <main className="admin">
        <h1>Admin</h1>
        <div className="banner" role="alert">{view.message}</div>
        {/* A real control, not a message that vanishes. */}
        <button type="button" className="btn-ghost" onClick={() => void load()}>Try again</button>
      </main>
    );
  }

  const { role, funnel, landing, webEvents, generatedAt } = view.data;
  const nothingYet = funnel.teachers === 0 && landing.signups === 0;
  const isDemo = role === 'demo';

  return (
    <main className="admin">
      <header className="admin__head">
        <div>
          <h1>Admin{isDemo && <span className="pill pill--demo">Demo</span>}</h1>
          <p className="admin__muted">As of {new Date(generatedAt).toLocaleString()}</p>
        </div>
        <div className="admin__actions">
          <button type="button" className="btn-ghost" onClick={() => void load()}>Refresh</button>
          <button type="button" className="btn-ghost" onClick={() => void onLogout()}>Sign out</button>
        </div>
      </header>

      {isDemo && (
        <p className="admin__caveat admin__demo" role="note">
          Demo access. Every number on this page is real; the people are not. Names, schools and
          phone numbers are withheld before the data leaves the server.
        </p>
      )}

      {nothingYet && (
        <p className="panel__empty admin__empty">
          No teachers and no sign-ups yet. Numbers appear here as soon as the first person joins.
        </p>
      )}

      <h2 className="admin__section">Acquisition</h2>
      <p className="admin__muted admin__note">
        Two ways in. A landing sign-up can later become a teacher, so these do not simply add up —
        someone who signs up here and then messages the bot appears on both sides.
      </p>
      <div className="stats stats--split">
        <Stat label="Teachers (WhatsApp direct)" value={funnel.teachers} hint="Distinct numbers that messaged the bot" />
        <Stat label="Activated" value={funnel.activated} hint="Reached an activated state" />
        <Stat label="Sign-ups (landing funnel)" value={landing.signups} hint="One row per phone number" />
        <Stat label="Tapped through to WhatsApp" value={landing.joinTapped} hint="Indicative, not exact — see note below" />
      </div>
      <p className="admin__caveat">
        “Tapped through” is indicative. The sign-up endpoint returns a usable id for an
        already-registered number, so the flag can be set by someone other than its owner. Accepted
        for the pilot — treat it as a trend, not a count.
      </p>

      <h2 className="admin__section">Leading indicators</h2>
      <div className="stats">
        <Stat label="Landing views" value={webEvents['landing_view'] ?? 0} />
        <Stat label="Sign-ups submitted" value={webEvents['signup_submitted'] ?? 0} />
        <Stat label="Join taps" value={webEvents['join_tapped'] ?? 0} />
        <Stat label="Onboarded" value={funnel.onboarded} />
      </div>

      <h2 className="admin__section">Lagging indicators</h2>
      <div className="stats">
        <Stat label="Completed two skills" value={funnel.completedBoth} />
        <Stat label="Papers exported" value={funnel.papersExported} />
        <Stat label="Median minutes saved" value={funnel.medianMinutesSaved ?? '—'} hint="Self-reported" />
        <Stat label="Referrals" value={funnel.referredCount} />
      </div>

      <h2 className="admin__section">Demographics</h2>
      <IndiaMap recent={landing.recent} />
      <div className="panels">
        <Bars title="Profession" rows={landing.byProfession} empty="No sign-ups yet." />
        <Bars title="City" rows={landing.byCity} empty="No sign-ups yet." />
        <Bars title="Country" rows={landing.byCountry} empty="No sign-ups yet." />
        <Bars title="Source" rows={landing.bySource} empty="No attribution recorded yet." />
      </div>

      <h2 className="admin__section">Recent sign-ups</h2>
      <p className="admin__muted admin__note">
        {isDemo
          ? 'Names, schools and phone numbers are withheld on demo access.'
          : <>Phone numbers are masked. Full numbers are available from <code>/api/admin/metrics?phones=full</code>.</>}
      </p>
      {landing.recent.length === 0 ? (
        <p className="panel__empty">Nobody has signed up through the landing page yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th scope="col">Name</th><th scope="col">Profession</th><th scope="col">City</th><th scope="col">Country</th><th scope="col">Phone</th><th scope="col">Joined</th></tr>
            </thead>
            <tbody>
              {landing.recent.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}{s.organization ? <span className="table__sub">{s.organization}</span> : null}</td>
                  <td>{s.profession.replace(/_/g, ' ')}</td>
                  <td>{s.city}</td>
                  <td>{s.country}</td>
                  <td className="table__mono">{s.phone}</td>
                  <td>{s.joinTappedAt ? <span className="pill pill--yes">Yes</span> : <span className="pill">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
