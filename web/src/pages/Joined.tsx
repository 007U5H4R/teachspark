import { Navigate, useLocation } from 'react-router';
import { Spark } from '../components/spark/Spark.tsx';
import { NeonButton } from '../components/NeonButton.tsx';
import { trackEvent } from '../lib/api.ts';
import { isHandOff, loadHandOff } from '../lib/session.ts';

/** Decorative: the button's own text already says "Open WhatsApp & Join", so this is aria-hidden. */
function WhatsAppMark() {
  return (
    <svg className="wa-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.99 2.898 9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
    </svg>
  );
}

export function Joined() {
  // Prefer the router state: it is THIS hand-off, and it works on browsers that block
  // sessionStorage entirely (locked-down WebViews, "block all cookies"). sessionStorage is the
  // fallback so a refresh on /joined still works wherever storage IS available.
  const { state } = useLocation();
  const handoff = isHandOff(state) ? state : loadHandOff();
  if (!handoff) return <Navigate to="/join" replace />;
  const firstName = handoff.name.split(/\s+/)[0] ?? handoff.name;
  const { url, code, whatsappNumber } = handoff.join;

  return (
    <main className="joined">
      <div style={{ width: 180, margin: '0 auto' }}><Spark mood="starry" size={180} /></div>
      <h1>You're in, {firstName}! 🎉</h1>
      <p className="joined__lead">One last step: connect on WhatsApp. The button opens WhatsApp with the join message already typed for you.</p>
      <NeonButton href={url} size="lg" onClick={() => trackEvent('join_tapped', handoff.signupId)}>
        <WhatsAppMark />Open WhatsApp &amp; Join
      </NeonButton>
      <ol className="steps" role="list">
        <li><span className="card__num">1</span><span>Tap the green button above — WhatsApp opens with the message <code>join {code}</code> already typed for you.</span></li>
        <li><span className="card__num">2</span><span><strong>Send</strong> that message (or, if it isn't there, type <code>join {code}</code> yourself and send it) to enter the TeachSpark sandbox. You'll get a "connected" reply back.</span></li>
        <li><span className="card__num">3</span><span>Then type <strong>Hi</strong> to begin — TeachSpark will greet you and show what you can make (worksheet, quiz or question paper).</span></li>
      </ol>
      <p className="joined__fallback">
        Didn't open? Save <strong>{whatsappNumber}</strong> in your contacts and type <code>join {code}</code> yourself, then send it.<br />
        It's a small pilot — if it ever stops replying, just tap the button again to rejoin.
      </p>
    </main>
  );
}
