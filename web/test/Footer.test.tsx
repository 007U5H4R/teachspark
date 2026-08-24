import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Footer } from '../src/components/Footer.tsx';

describe('Footer', () => {
  it('renders the brand, the privacy promise and the four links', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    const footer = screen.getByRole('contentinfo');
    // The two-tone Wordmark splits "Teach"/"Spark" across spans, so assert the brand's full text.
    expect(footer.querySelector('.footer__brand')).toHaveTextContent('TeachSpark');
    // The consent promise is the one claim made on every page; it must not quietly disappear.
    expect(within(footer).getByText(/No student data, ever\./)).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#how');
    expect(within(footer).getByRole('link', { name: 'Why teachers use it' })).toHaveAttribute('href', '/#why');
    // Regression: the footer used to omit the Demo link the nav offers (it must mirror the nav).
    expect(within(footer).getByRole('link', { name: 'Demo' })).toHaveAttribute('href', '/demo');
    expect(within(footer).getByRole('link', { name: 'Join the pilot' })).toHaveAttribute('href', '/join');
  });

  it('keeps an explicit role="list" on the link list', () => {
    // Safari strips the implicit list role when list-style: none is set; jsdom applies no CSS, so it
    // cannot reproduce that. We assert the explicit role="list" attribute the component ships instead.
    const { container } = render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(container.querySelector('.footer__links')).toHaveAttribute('role', 'list');
  });
});
