import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, NavLink } from 'react-router';
import { NeonButton } from './NeonButton.tsx';

// Only Home is a NavLink: NavLink's active check ignores the hash, so '/#how' would also light up on '/'.
const ANCHORS = [
  { to: '/#how', label: 'How it works' },
  { to: '/#why', label: 'Why teachers use it' },
];

export function Nav({ showSignup }: { showSignup: boolean }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // A nav link click navigates away — leave focus alone so it doesn't fight the navigation.
  const close = () => setOpen(false);

  // Toggle- or Escape-driven close: nothing else claims focus, so return it to the control
  // that opened the menu instead of letting it fall to <body> (WCAG 2.4.3).
  const closeAndRefocus = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (open && e.key === 'Escape') closeAndRefocus();
  };

  return (
    <nav className={`nav${open ? ' nav--open' : ''}`} aria-label="Main" onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={toggleRef}
        className="nav__toggle"
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => (open ? closeAndRefocus() : setOpen(true))}
      >
        <span aria-hidden="true">{open ? '×' : '☰'}</span>
      </button>
      <Link to="/" className="nav__brand">TeachSpark</Link>
      <ul className="nav__pills" role="list">
        <li><NavLink to="/" end className="nav__pill" onClick={close}>Home</NavLink></li>
        {ANCHORS.map((l) => (
          <li key={l.to}><Link to={l.to} className="nav__pill" onClick={close}>{l.label}</Link></li>
        ))}
      </ul>
      <div className="nav__cta">{showSignup && <NeonButton to="/join">Sign up</NeonButton>}</div>
    </nav>
  );
}
