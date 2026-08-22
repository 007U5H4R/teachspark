import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NeonButton } from '../src/components/NeonButton.tsx';

describe('NeonButton', () => {
  it('renders an internal link for `to`', () => {
    render(<MemoryRouter><NeonButton to="/join">Sign up</NeonButton></MemoryRouter>);
    const a = screen.getByRole('link', { name: 'Sign up' });
    expect(a).toHaveAttribute('href', '/join');
    expect(a).toHaveClass('neon-btn', 'neon-btn--md');
    expect(a).not.toHaveAttribute('target');
  });
  it('renders an external anchor opening a new tab for `href`', () => {
    render(<NeonButton href="https://wa.me/1?text=join" size="lg">Open WhatsApp</NeonButton>);
    const a = screen.getByRole('link', { name: 'Open WhatsApp' });
    expect(a).toHaveAttribute('href', 'https://wa.me/1?text=join');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(a).toHaveClass('neon-btn--lg');
  });
});
