import { Link } from 'react-router';
import { Wordmark } from './Wordmark.tsx';

// Same '/#hash' form the nav uses (Nav.tsx:6-9): a routed link back to the landing page's section,
// so these still work from /join and /joined where those anchors do not exist.
// Keep this list in step with the nav's pills.
const LINKS = [
  { to: '/#how', label: 'How it works' },
  { to: '/#demo', label: 'Demo' },
  { to: '/#why', label: 'Why teachers use it' },
  { to: '/join', label: 'Join the pilot' },
  { to: '/privacy', label: 'Your data & privacy' },
];

export function Footer() {
  return (
    <footer className="footer">
      <div>
        <p className="footer__brand"><Wordmark /></p>
        <p className="footer__blurb">
          A free pilot for teachers: a WhatsApp bot that writes a ready-to-use worksheet for your own class in about two minutes.
        </p>
        <p className="footer__promise"><span className="footer__dot" aria-hidden="true" />No student data, ever.</p>
      </div>
      <ul className="footer__links" role="list">
        {LINKS.map((l) => <li key={l.to}><Link to={l.to}>{l.label}</Link></li>)}
      </ul>
      <p className="footer__legal">© 2026 TeachSpark — a small pilot. You can leave anytime.</p>
    </footer>
  );
}
