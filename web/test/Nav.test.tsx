import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Nav } from '../src/components/Nav.tsx';

describe('Nav', () => {
  it('renders the brand, the pill links, and the neon sign-up CTA pointing at /join', () => {
    render(<MemoryRouter><Nav showSignup /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'TeachSpark' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/join');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveClass('neon-btn');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#how');
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
});
