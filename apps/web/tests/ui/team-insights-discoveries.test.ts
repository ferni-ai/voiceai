/**
 * The team panel shows the team's standing notes, once each, and the first-run
 * empty state only when there is truly nothing.
 *
 * 2026-11-16 audit: a 317-day user saw "We're getting to know you" while
 * GET /api/team-insights carried seven notes; the panel read only `insights`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api-helpers.js', () => ({
  getApiHeadersAsync: vi.fn(async () => ({})),
  getUserId: vi.fn(() => null),
}));
vi.mock('../../src/services/authed-websocket.service.js', () => ({
  openAuthedWebSocket: vi.fn(),
}));

const teamStatus = {
  financialHealth: { budgetOnTrack: true, savingsProgress: 0 },
  habitHealth: { activeHabits: 0, totalStreakDays: 0, keystoneActive: false },
  goalHealth: { activeGoals: 0, nearingCompletion: 0 },
  emotionalContext: 'neutral',
  topConcern: null,
};

const NOTE =
  'You mentioned something you wanted to do: "make some keys". Just checking in, no pressure.';
const note = (id: string, content = NOTE) => ({
  id,
  source: 'ferni',
  category: 'commitment-followup',
  summary: 'You mentioned something you wanted to do: "make some keys".',
  content,
  priority: 'high',
  createdAt: 1_790_000_000_000,
  isNew: false,
});

function serve(body: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ teamStatus, ...body }), { status: 200 }))
  );
}

async function openPanel(): Promise<void> {
  const { teamInsightsUI } = await import('../../src/ui/team-insights.ui.js');
  teamInsightsUI.init();
  teamInsightsUI.open();
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLElement>('.team-insights-loading')?.style.display).toBe(
      'none'
    )
  );
}

const cards = () => [...document.querySelectorAll('.team-insight-card')];
const emptyShown = () =>
  document.querySelector<HTMLElement>('.team-insights-empty')?.style.display === 'block';

describe('team insights panel: discoveries', () => {
  afterEach(async () => {
    const { teamInsightsUI } = await import('../../src/ui/team-insights.ui.js');
    teamInsightsUI.dispose();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('lists the notes when there are no insights, instead of the first-run empty state', async () => {
    serve({
      insights: [],
      discoveries: [note('n1'), note('n2', 'Your keystone habit is carrying the week.')],
    });
    await openPanel();

    expect(emptyShown()).toBe(false);
    expect(cards().map((c) => c.getAttribute('data-insight-id'))).toEqual(['n1', 'n2']);
  });

  it('shows a line the server sent twice once', async () => {
    serve({
      insights: [note('i1')],
      discoveries: [note('d1'), note('d2', NOTE.replace(', no pressure', ' - no pressure'))],
    });
    await openPanel();

    expect(cards()).toHaveLength(1);
    expect(cards()[0].getAttribute('data-insight-id')).toBe('i1');
  });

  it('keeps the empty state for someone the team has nothing on yet', async () => {
    serve({ insights: [], discoveries: [] });
    await openPanel();

    expect(emptyShown()).toBe(true);
    expect(cards()).toHaveLength(0);
  });
});
