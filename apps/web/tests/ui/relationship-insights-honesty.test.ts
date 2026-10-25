/**
 * Relationship Insights shows the user's own people, or says it couldn't load.
 *
 * Before: any failure (and, because the server's body didn't match, every
 * success too) fell into a catch that rendered made-up people: "Reconnect
 * with Sarah", "Mom's birthday is coming up", 12 people, random activity.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('../../src/utils/api-helpers.js', () => ({ apiFetch }));

const { openRelationshipInsights, closeRelationshipInsights } =
  await import('../../src/ui/relationship-insights.ui.js');

/**
 * GET /api/contacts/insights body as src/services/contacts/relationship-insights-view.ts
 * builds it (src/tests/relationship-insights-contract.test.ts runs the real route).
 */
const serverBody = {
  stats: {
    totalPeople: 2,
    familyCount: 1,
    friendCount: 0,
    colleagueCount: 1,
    averageStrength: 55,
    upcomingDates: 1,
    needsAttention: 1,
  },
  insights: [
    {
      id: 'dana@example.com:weakening',
      type: 'warning',
      title: 'Dana',
      description: "You haven't connected with Dana in 40 days",
      actionLabel: 'Send Dana a quick message to check in',
      contactId: 'dana@example.com',
      contactName: 'Dana',
      priority: 'medium',
    },
  ],
  strengthDistribution: [
    { label: 'Strong', value: 50, color: 'var(--persona-primary)' },
    { label: 'Good', value: 0, color: 'var(--nayan-primary)' },
    { label: 'Needs work', value: 50, color: 'var(--color-semantic-error)' },
  ],
  recentActivity: Array.from({ length: 28 }, (_, i) => ({
    date: `2026-09-${String(28 - (i % 28)).padStart(2, '0')}`,
    count: i === 1 ? 1 : 0,
  })),
};

async function openAndSettle(): Promise<string> {
  openRelationshipInsights();
  await vi.waitFor(() => {
    expect(document.querySelector('.ri-loading-text')).toBeNull();
  });
  return document.querySelector('.relationship-insights-modal')?.textContent ?? '';
}

beforeEach(() => {
  closeRelationshipInsights();
  document.body.innerHTML = '';
  apiFetch.mockReset();
});

describe('Relationship Insights', () => {
  it('says "Not enough yet", not "null%" or 0%, while no contact has a strength score', async () => {
    const body = { ...serverBody, stats: { ...serverBody.stats, averageStrength: null } };
    apiFetch.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    await openAndSettle();

    const stats = [...document.querySelectorAll('.ri-stat-value')].map((el) => el.textContent);
    expect(stats).toEqual(['2', '1', '1', 'Not enough yet']);
  });

  it("renders the server's real people and numbers", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify(serverBody), { status: 200 }));

    const text = await openAndSettle();

    expect(apiFetch).toHaveBeenCalledWith('/api/contacts/insights');
    const stats = [...document.querySelectorAll('.ri-stat-value')].map((el) => el.textContent);
    expect(stats).toEqual(['2', '1', '1', '55%']);
    expect(text).not.toContain('Sarah');

    document.querySelector<HTMLElement>('[data-tab="insights"]')?.click();
    const insights = [...document.querySelectorAll('.ri-insight-desc')].map((el) => el.textContent);
    expect(insights).toEqual(["You haven't connected with Dana in 40 days"]);
  });

  it.each([
    {
      n: 0,
      averageStrength: null,
      bars: [] as typeof serverBody.strengthDistribution,
      shown: 'Not enough yet',
    },
    { n: 1, averageStrength: 80, bars: serverBody.strengthDistribution, shown: '80%' },
    { n: 3, averageStrength: 47, bars: serverBody.strengthDistribution, shown: '47%' },
  ])(
    'with $n scored people the strength stat reads "$shown"',
    async ({ averageStrength, bars, shown }) => {
      const body = {
        ...serverBody,
        stats: { ...serverBody.stats, averageStrength },
        strengthDistribution: bars,
      };
      apiFetch.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

      const text = await openAndSettle();

      const stats = [...document.querySelectorAll('.ri-stat-value')].map((el) =>
        el.textContent?.trim()
      );
      expect(stats[3]).toBe(shown);
      expect(text).not.toContain('null%');
      expect(Boolean(document.querySelector('.ri-chart-empty'))).toBe(bars.length === 0);
    }
  );

  it('says it could not load instead of showing made-up people', async () => {
    apiFetch.mockResolvedValue(new Response('{"error":"Internal server error"}', { status: 500 }));

    const text = await openAndSettle();

    expect(text).toContain("Couldn't load your relationship insights. Try again?");
    expect(text).not.toContain('Sarah');
    expect(document.querySelectorAll('.ri-stat-value')).toHaveLength(0);
  });

  it('reopened right after closing, it stays open', async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify(serverBody), { status: 200 }));
    openRelationshipInsights();
    vi.useFakeTimers();
    try {
      const closed = document.querySelector('.relationship-insights-overlay');
      closeRelationshipInsights();
      openRelationshipInsights(); // within the close animation
      const reopened = [...document.querySelectorAll('.relationship-insights-overlay')].at(-1);
      vi.advanceTimersByTime(1000); // the first one's removal timer fires
      // It removed the one it closed, not the one just opened
      expect(reopened?.isConnected, 'the reopened modal is still on the page').toBe(true);
      expect(closed?.isConnected, 'the closed one is gone').toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
