import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import type { AdminMetrics } from '../src/lib/adminApi.ts';

// Keep the real module (incl. nudgeReengagementRate); stub only the two network calls so <Admin/>
// mounts straight into the ready state with a known payload. vi.hoisted so the mock factory
// (which vitest hoists above the file) can see the fixture.
const metrics = vi.hoisted<AdminMetrics>(() => ({
  role: 'admin',
  funnel: {
    teachers: 18, onboarded: 13, activated: 9, impactReported: 4,
    returnedForSkill2: 1, completedBoth: 0, medianMinutesSaved: 30,
    referredCount: 3, nudgesSent: 4, nudgesReopened: 1,
    papersExported: 2, medianPaperMinutesSaved: 30, eventCounts: {},
  },
  landing: {
    signups: 25, joinTapped: 19,
    byProfession: [], byMethod: [], byCity: [], byCountry: [], bySource: [], recent: [],
  },
  webEvents: {},
  generatedAt: '2026-08-26T00:00:00.000Z',
}));

vi.mock('../src/lib/adminApi.ts', async (importActual) => {
  const actual = await importActual<typeof import('../src/lib/adminApi.ts')>();
  return {
    ...actual,
    hasSession: vi.fn().mockResolvedValue(true),
    fetchMetrics: vi.fn().mockResolvedValue(metrics),
  };
});

import { Admin } from '../src/pages/Admin.tsx';

function sectionAfter(heading: string): HTMLElement {
  // The stats grid is the heading's next element sibling in Admin.tsx.
  const h = screen.getByRole('heading', { name: heading });
  const grid = h.nextElementSibling?.nextElementSibling as HTMLElement; // <h2>, <p note>, <div stats>
  return grid;
}

describe('Admin — Retention & nudges section', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows nudges sent, returns after a nudge, and the re-engagement rate', async () => {
    render(<Admin />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Retention & nudges' })).toBeInTheDocument());

    const grid = sectionAfter('Retention & nudges');
    // Nudges sent = 4, returned = 1, rate = round(1/4) = 25%.
    expect(within(grid).getByText('4')).toBeInTheDocument();
    expect(within(grid).getByText('Nudges sent')).toBeInTheDocument();
    expect(within(grid).getByText('Returned after a nudge')).toBeInTheDocument();
    expect(within(grid).getByText('25%')).toBeInTheDocument();
    expect(within(grid).getByText('Re-engagement rate')).toBeInTheDocument();
  });
});
