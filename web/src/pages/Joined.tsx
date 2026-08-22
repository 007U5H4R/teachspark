import { Navigate } from 'react-router';
import { Spark } from '../components/spark/Spark.tsx';
import { NeonButton } from '../components/NeonButton.tsx';
import { trackEvent } from '../lib/api.ts';
import { loadHandOff } from '../lib/session.ts';

export function Joined() {
  const handoff = loadHandOff();
  if (!handoff) return <Navigate to="/join" replace />;
  const firstName = handoff.name.split(/\s+/)[0] ?? handoff.name;
  const { url, code, whatsappNumber } = handoff.join;

  return (
    <main className="joined">
      <div style={{ width: 180, margin: '0 auto' }}><Spark mood="starry" size={180} /></div>
      <h1>You're in, {firstName}! 🎉</h1>
      <p className="joined__lead">One last step: connect on WhatsApp. The button opens WhatsApp with the join message already typed for you.</p>
      <NeonButton href={url} size="lg" onClick={() => trackEvent('join_tapped', handoff.signupId)}>Open WhatsApp &amp; Join</NeonButton>
      <ol className="steps" role="list">
        <li><span className="card__num">1</span><span>Tap the button above — WhatsApp opens with <code>join {code}</code> pre-filled.</span></li>
        <li><span className="card__num">2</span><span><strong>Send</strong> that message as it is. You'll get a "connected" reply.</span></li>
        <li><span className="card__num">3</span><span>Then type <strong>Hi</strong> to start your first worksheet.</span></li>
      </ol>
      <p className="joined__fallback">
        Didn't open? Save <strong>{whatsappNumber}</strong> in your contacts and send it <code>join {code}</code> yourself.<br />
        It's a small pilot — if it ever stops replying, just tap the button again to rejoin.
      </p>
    </main>
  );
}
