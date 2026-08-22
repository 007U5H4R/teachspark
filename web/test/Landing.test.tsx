import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Landing } from '../src/pages/Landing.tsx';

describe('Landing', () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); sessionStorage.clear(); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); });

  it('renders the hero with the orb and a Get started CTA to /join', () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worksheets/i);
    expect(screen.getByRole('img', { name: /Spark/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get started/ })).toHaveAttribute('href', '/join');
    expect(screen.getByRole('heading', { name: /How it works/ })).toHaveAttribute('id', 'how');
    expect(screen.getByText(/No student data/)).toBeInTheDocument();
  });
  it('puts the headline before the pitch and the CTA in the DOM', () => {
    // Regression guard. The hero used to read eyebrow -> CTA -> headline, which on a 375px phone
    // put the product's name at y=615 — below the practical fold, after the button. A teacher
    // opening the WhatsApp link met a green orb and grey text before she met the product.
    // DOM order is the reading order for assistive tech, so assert it here rather than in CSS.
    const { container } = render(<MemoryRouter><Landing /></MemoryRouter>);
    const hero = container.querySelector('.hero')!;
    const order = [...hero.children].map((el) => el.className);
    expect(order.indexOf('hero__title')).toBe(0);
    expect(order.indexOf('hero__title')).toBeLessThan(order.indexOf('hero__eyebrow'));
    expect(order.indexOf('hero__eyebrow')).toBeLessThan(order.indexOf('hero__actions'));
  });
  it('tracks landing_view once per session and stores ?src=', () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/?src=grp-a']}><Landing /></MemoryRouter>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).name).toBe('landing_view');
    expect(sessionStorage.getItem('ts_src')).toBe('grp-a');
    expect(sessionStorage.getItem('ts_lv')).toBe('1');
    unmount();
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(fetchMock).toHaveBeenCalledTimes(1); // deduped within the tab session
  });
  it('Spark goes starry while the CTA is hovered', async () => {
    const user = userEvent.setup();
    const { container } = render(<MemoryRouter><Landing /></MemoryRouter>);
    await user.hover(screen.getByRole('link', { name: /Get started/ }));
    expect(container.querySelector('.spark')).toHaveAttribute('data-state', 'starry');
    await user.unhover(screen.getByRole('link', { name: /Get started/ }));
    expect(container.querySelector('.spark')).toHaveAttribute('data-state', 'default');
  });
});
