import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App.tsx';

describe('App', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 }))));
  afterEach(() => vi.unstubAllGlobals());
  it('renders the landing page on / with the nav CTA', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worksheets/i);
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });
  it('falls back to the landing page for unknown routes', () => {
    render(<MemoryRouter initialEntries={['/nope']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worksheets/i);
  });
});
