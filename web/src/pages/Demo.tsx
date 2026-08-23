import { PhoneDemo } from '../components/PhoneDemo.tsx';
import { NeonButton } from '../components/NeonButton.tsx';

export function Demo() {
  return (
    <main className="demo">
      <h1 className="demo__title">See how it works</h1>
      <p className="demo__lead">
        A quick walkthrough of the whole thing — sign up, connect on WhatsApp, and make your first
        worksheet. This is exactly what you'll do once you join.
      </p>
      <PhoneDemo autoPlay />
      <div className="demo__cta">
        <NeonButton to="/join" size="lg">Sign up for the pilot</NeonButton>
      </div>
    </main>
  );
}
