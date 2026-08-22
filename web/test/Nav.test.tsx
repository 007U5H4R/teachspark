import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Nav } from '../src/components/Nav.tsx';

describe('Nav', () => {
  it('renders the brand, the pill links, and the neon sign-up CTA pointing at /join', () => {
    const { container } = render(<MemoryRouter><Nav showSignup /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'TeachSpark' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/join');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveClass('neon-btn');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#how');
    // list-style: none strips implicit role in jsdom—we verify the attribute instead of role query
    expect(container.querySelector('.nav__pills')).toHaveAttribute('role', 'list');
  });
  it('hides the CTA when showSignup is false', () => {
    render(<MemoryRouter><Nav showSignup={false} /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Sign up' })).toBeNull();
  });
  it('toggles the mobile menu', async () => {
    render(<MemoryRouter><Nav showSignup /></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation')).toHaveClass('nav--open');
  });
  it('returns focus to the toggle when the toggle closes the menu', async () => {
    render(<MemoryRouter><Nav showSignup /></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    await userEvent.click(toggle); // open
    // Simulate a keyboard user who tabbed into the open menu before backing out.
    screen.getByRole('link', { name: 'Home' }).focus();
    expect(document.activeElement).not.toBe(toggle);

    // A bare fireEvent.click (unlike userEvent.click) does not simulate the browser's
    // default focus-on-click, so this isolates the explicit toggleRef.focus() in the fix
    // rather than piggybacking on jsdom's own click-focus behavior.
    fireEvent.click(toggle); // close, same node — aria-label just flipped back
    expect(screen.getByRole('navigation')).not.toHaveClass('nav--open');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(toggle);
  });
  it('returns focus to the toggle when Escape closes the menu', async () => {
    render(<MemoryRouter><Nav showSignup /></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    await userEvent.click(toggle); // open
    screen.getByRole('link', { name: 'Home' }).focus();
    expect(document.activeElement).not.toBe(toggle);

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('navigation')).not.toHaveClass('nav--open');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(toggle);
  });
  it('leaves focus on the clicked link when a nav link closes the menu', async () => {
    render(<MemoryRouter><Nav showSignup /></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    await userEvent.click(toggle); // open

    const homeLink = screen.getByRole('link', { name: 'Home' });
    await userEvent.click(homeLink);

    expect(screen.getByRole('navigation')).not.toHaveClass('nav--open');
    // Navigation is in flight — focus must stay on the link, not jump back to the toggle.
    expect(document.activeElement).toBe(homeLink);
  });
});
