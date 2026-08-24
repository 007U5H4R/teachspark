import { Spark } from '../components/spark/Spark.tsx';
import type { Behavior } from '../components/spark/eyeShape.ts';
import type { Mood } from '../components/spark/eyes.ts';

// Preview of Sparky's expressions. Each orb is pinned to one expression via <Spark hold=…/>, which
// centres the gaze and freezes the shape so you can read the geometry. The expressions themselves
// live in the parametric eye engine (eyeShape.ts) — this page only displays them.

const EXPRESSIONS: Array<{ hold: Behavior; label: string; note: string }> = [
  { hold: 'tracking', label: 'Neutral', note: 'resting ovals' },
  { hold: 'happy', label: 'Happy', note: 'upward crescents' },
  { hold: 'curious', label: 'Curious', note: 'outer corners up' },
  { hold: 'angry', label: 'Angry', note: 'sharp inward slant' },
  { hold: 'sad', label: 'Sad', note: 'soft downward droop' },
  { hold: 'skeptical', label: 'Skeptical', note: 'heavy-lidded squint' },
];

// A second batch of geometric eye shapes (robot-emoticon archetypes).
const SHAPES: Array<{ hold: Behavior; label: string; note: string }> = [
  { hold: 'wide', label: 'Wide', note: 'small round — shocked' },
  { hold: 'squint', label: 'Squint', note: '“><” narrowed slant' },
  { hold: 'bored', label: 'Bored', note: 'flat deadpan dashes' },
  { hold: 'focused', label: 'Focused', note: 'narrowed, locked in' },
  { hold: 'mischief', label: 'Mischief', note: 'sharp, menacing slant' },
  { hold: 'smug', label: 'Smug', note: 'heavy-lidded, unimpressed' },
  { hold: 'wink', label: 'Wink', note: 'one eye shut, one smiling' },
];

// Symbol overlays — hearts, spirals, glyphs — driven by `mood`, not `hold`.
const OVERLAYS: Array<{ mood: Mood; label: string; note: string }> = [
  { mood: 'love', label: 'Love', note: 'red beating hearts' },
  { mood: 'dizzy', label: 'Dizzy', note: 'blue spinning spirals' },
  { mood: 'starry', label: 'Star-struck', note: 'gold sparkle eyes' },
  { mood: 'money', label: 'Money', note: 'gold “$” eyes' },
  { mood: 'confused', label: 'Confused', note: 'blue “?” eyes' },
  { mood: 'dead', label: 'Dead', note: '“✕ ✕” knocked out' },
];

// The behaviours that already existed before this set — shown so the whole vocabulary is in one place.
const MORE: Array<{ hold: Behavior; label: string }> = [
  { hold: 'surprised', label: 'Surprised' },
  { hold: 'thinking', label: 'Thinking' },
  { hold: 'success', label: 'Success' },
  { hold: 'error', label: 'Error' },
  { hold: 'attention', label: 'Attention' },
  { hold: 'sleeping', label: 'Sleeping' },
];

function Cell({ hold, label, note }: { hold: Behavior; label: string; note?: string }) {
  return (
    <figure className="lab__cell">
      <div className="lab__orb"><Spark hold={hold} size={150} /></div>
      <figcaption className="lab__cap">
        <span className="lab__label">{label}</span>
        {note && <span className="lab__note">{note}</span>}
      </figcaption>
    </figure>
  );
}

// Symbol overlays (hearts, spirals, …) live in the mood system, not the parametric engine, so they
// are driven by the `mood` prop rather than `hold`.
function MoodCell({ mood, label, note }: { mood: Mood; label: string; note?: string }) {
  return (
    <figure className="lab__cell">
      <div className="lab__orb"><Spark mood={mood} size={150} /></div>
      <figcaption className="lab__cap">
        <span className="lab__label">{label}</span>
        {note && <span className="lab__note">{note}</span>}
      </figcaption>
    </figure>
  );
}

export function SparkLab() {
  return (
    <main className="lab">
      <header className="lab__head">
        <h1>Sparky — expressions</h1>
        <p className="lab__lead">Six emotion shapes built from the eye engine’s tilt + curve. Move your cursor around the page to see each one hold its shape while the gaze stays put.</p>
      </header>
      <section className="lab__grid" aria-label="New expressions">
        {EXPRESSIONS.map((e) => <Cell key={e.hold} {...e} />)}
      </section>
      <h2 className="lab__subhead">More shapes</h2>
      <section className="lab__grid" aria-label="More shapes">
        {SHAPES.map((e) => <Cell key={e.hold} {...e} />)}
      </section>
      <h2 className="lab__subhead">Symbol overlays</h2>
      <section className="lab__grid" aria-label="Symbol overlays">
        {OVERLAYS.map((e) => <MoodCell key={e.mood} {...e} />)}
      </section>
      <h2 className="lab__subhead">Existing behaviours</h2>
      <section className="lab__grid" aria-label="Existing behaviours">
        {MORE.map((e) => <Cell key={e.hold} {...e} />)}
      </section>
    </main>
  );
}
