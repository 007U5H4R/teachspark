import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Spark } from '../src/components/spark/Spark.tsx';

afterEach(() => vi.useRealTimers());

describe('Spark', () => {
  it('renders an accessible orb in the default state with both eyes', () => {
    render(<Spark />);
    const orb = screen.getByRole('img', { name: /Spark/ });
    expect(orb.closest('[data-state]')).toHaveAttribute('data-state', 'default');
    expect(orb.querySelectorAll('[data-eye]')).toHaveLength(2);
  });
  it('reflects the mood prop', () => {
    const { container } = render(<Spark mood="starry" />);
    expect(container.firstElementChild).toHaveAttribute('data-state', 'starry');
  });
  it('goes puppy-eyed on hover and back on leave', async () => {
    const user = userEvent.setup();
    const { container } = render(<Spark />);
    const root = container.firstElementChild as HTMLElement;
    await user.hover(root);
    expect(root).toHaveAttribute('data-state', 'puppy');
    await user.unhover(root);
    expect(root).toHaveAttribute('data-state', 'default');
  });
  it('blinks on the configured cadence', () => {
    vi.useFakeTimers();
    const { container } = render(<Spark blinkEveryMs={1000} />);
    const root = container.firstElementChild as HTMLElement;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(root).toHaveAttribute('data-state', 'blink');
    act(() => { vi.advanceTimersByTime(200); });
    expect(root).toHaveAttribute('data-state', 'default');
  });
});
