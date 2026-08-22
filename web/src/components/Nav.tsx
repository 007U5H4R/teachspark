import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { NeonButton } from './NeonButton.tsx';

// Only Home is a NavLink: NavLink's active check ignores the hash, so '/#how' would also light up on '/'.
const ANCHORS = [
  { to: '/#how', label: 'How it works' },
  { to: '/#why', label: 'Why teachers use it' },
];

export function Nav({ showSignup }: { showSignup: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <nav className={`nav${open ? ' nav--open' : ''}`} aria-label="Main">
      <button type="button" className="nav__toggle" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? '×' : '☰'}</span>
      </button>
      <Link to="/" className="nav__brand">TeachSpark</Link>
      <ul className="nav__pills">
        <li><NavLink to="/" end className="nav__pill" onClick={close}>Home</NavLink></li>
        {ANCHORS.map((l) => (
          <li key={l.to}><Link to={l.to} className="nav__pill" onClick={close}>{l.label}</Link></li>
        ))}
      </ul>
      <div className="nav__cta">{showSignup && <NeonButton to="/join">Sign up</NeonButton>}</div>
    </nav>
  );
}
