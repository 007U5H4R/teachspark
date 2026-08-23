import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IndiaMap } from '../src/components/IndiaMap/IndiaMap.tsx';

describe('IndiaMap', () => {
  it('renders a marker per known city, sized by count', () => {
    const { container } = render(
      <IndiaMap recent={[{ city: 'Mumbai' }, { city: 'Mumbai' }, { city: 'Delhi' }]} />,
    );
    const circles = container.querySelectorAll('.india-map__dot');
    expect(circles).toHaveLength(2); // Mumbai + Delhi, one marker each (not one per row)
    expect(screen.getByText(/Mumbai — 2/)).toBeInTheDocument();
    expect(screen.getByText(/Delhi — 1/)).toBeInTheDocument();
  });

  it('shows an empty state with zero locations', () => {
    render(<IndiaMap recent={[]} />);
    expect(screen.getByText(/No locations yet/)).toBeInTheDocument();
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('ignores an unrecognised city without crashing', () => {
    const { container } = render(<IndiaMap recent={[{ city: 'Atlantis' }, { city: 'Pune' }]} />);
    const circles = container.querySelectorAll('.india-map__dot');
    expect(circles).toHaveLength(1); // only Pune is in the coordinate lookup
    expect(screen.getByText(/Pune — 1/)).toBeInTheDocument();
  });

  it('gives the svg an accessible role and label', () => {
    render(<IndiaMap recent={[{ city: 'Chennai' }]} />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('1 city marked'));
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('1 of 1 sign-ups'));
  });

  it('counts a city it cannot place instead of dropping it from the total', () => {
    // The caption has to agree with the sign-up count shown elsewhere on the dashboard.
    render(<IndiaMap recent={[{ city: 'Pune' }, { city: 'Atlantis' }]} />);
    expect(screen.getByText(/1 of 2 sign-ups placed/)).toBeInTheDocument();
    expect(screen.getByText(/1 not recognised/)).toBeInTheDocument();
  });
});
