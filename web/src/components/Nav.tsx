import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, NavLink } from 'react-router';
import { NeonButton } from './NeonButton.tsx';
import { Wordmark } from './Wordmark.tsx';
import { emitOrbHover } from '../lib/ctaHover.ts';
import { trackEvent } from '../lib/api.ts';

// Only Home is a NavLink: NavLink's active check ignores the hash, so '/#how' would also light up on '/'.
const ANCHORS = [
  { to: '/#how', label: 'How it works' },
  { to: '/#demo', label: 'Demo' },
  { to: '/#why', label: 'Why teachers use it' },
];

export function Nav({ showSignup }: { showSignup: boolean }) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Tapping anywhere off the menu dismisses it, which is what a dropdown is expected to do —
  // reaching back up to the × to get out of the way is friction on a phone.
  //
  // pointerdown, not click: it fires on touch-down so the menu is already gone by the time the tap
  // completes, and a tap on a link outside the nav both closes this and still follows the link.
  // Anything INSIDE the nav is left alone, so the toggle's own handler keeps owning the toggle
  // (otherwise this would close the menu a moment before the button reopened it) and a menu link
  // keeps closing via its own onClick.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const nav = navRef.current;
      if (nav && e.target instanceof Node && !nav.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

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
    <nav ref={navRef} className={`nav${open ? ' nav--open' : ''}`} aria-label="Main" onKeyDown={onKeyDown}>
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
      {/* The nav lives outside Landing, so each element announces which expression the orb should
          make on hover (see lib/ctaHover.ts): logo → starry, tabs → skeptical, CTA → love. */}
      <Link to="/" className="nav__brand" onPointerEnter={() => emitOrbHover('starry')} onPointerLeave={() => emitOrbHover(null)}><Wordmark /></Link>
      <ul className="nav__pills" role="list" onPointerEnter={() => emitOrbHover('skeptical')} onPointerLeave={() => emitOrbHover(null)}>
        <li><NavLink to="/" end className="nav__pill" onClick={close}>Home</NavLink></li>
        {ANCHORS.map((l) => (
          <li key={l.to}><Link to={l.to} className="nav__pill" onClick={close}>{l.label}</Link></li>
        ))}
      </ul>
      <div className="nav__cta" onPointerEnter={() => emitOrbHover('love')} onPointerLeave={() => emitOrbHover(null)}>
        {showSignup && <NeonButton to="/join" onClick={() => trackEvent('cta_tapped', { where: 'nav' })}>Get my worksheet</NeonButton>}
      </div>
    </nav>
  );
}
