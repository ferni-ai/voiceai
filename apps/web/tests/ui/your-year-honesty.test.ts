/**
 * "This Year Together" shows only what is there, safely, on the user's calendar.
 *
 * Before: Emotional Milestones and Dreams rendered as empty sections (prod has 0
 * dreams docs), the heat map packed only the days with conversations into weeks
 * (quiet days vanished), and dream text went into innerHTML unescaped.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, getUserId } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  getUserId: vi.fn<() => string | null>(() => 'firebase-uid-123'),
}));

vi.mock('../../src/utils/api.js', () => ({ apiGet, getUserId }));
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  closeYourYearWithFerni,
  openYourYearWithFerni,
} from '../../src/ui/your-year-with-ferni.ui.js';

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

const localDay = (daysAgo: number) => {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA').format(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12)
  );
};

function year(extra: Record<string, unknown> = {}) {
  return {
    startDate: new Date().toISOString(),
    conversationCounts: [
      { date: localDay(10), count: 2 },
      { date: localDay(1), count: 1 },
    ],
    emotionalJourney: [],
    teamUnlocks: [],
    dreams: [],
    commitments: [],
    milestones: [],
    topTopics: [],
    relationshipGrowth: { peopleTracked: 0, newConnections: 0, deepenedRelationships: 0 },
    stats: {
      totalConversations: 3,
      longestStreak: 1,
      currentStreak: 1,
      averageConversationsPerWeek: 1,
      mostActiveMonth: 'October',
      teamMembersUnlocked: 0,
      dreamsTracked: 0,
      commitmentsKept: 0,
    },
    ...extra,
  };
}

describe('This Year Together', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] });
    Element.prototype.animate = vi.fn() as unknown as Element['animate'];
    apiGet.mockReset();
  });

  afterEach(async () => {
    await settle(closeYourYearWithFerni());
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('asks for days in the browser zone', async () => {
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: year() });
    await settle(openYourYearWithFerni());
    expect(String(apiGet.mock.calls[0]?.[0])).toMatch(
      /^\/api\/year-in-review\/firebase-uid-123\?tz=/
    );
  });

  it('hides sections with nothing in them', async () => {
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: year() });
    await settle(openYourYearWithFerni());
    expect(document.querySelector('#milestones-title')).toBeNull();
    expect(document.querySelector('#dreams-title')).toBeNull();
    // The team section stays and says why it is empty (main: TEAM_BY_NEED, teamUnavailable).
    expect(document.querySelector('.your-year-team-empty')).not.toBeNull();
  });

  it('keeps quiet days in the heat map, 13 full weeks, counts on the right days', async () => {
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: year() });
    await settle(openYourYearWithFerni());
    const days = [...document.querySelectorAll<HTMLElement>('.heatmap-day')];
    expect(days).toHaveLength(91);
    expect(days.map((d) => Number(d.dataset.count)).reduce((a, b) => a + b, 0)).toBe(3);
    expect(days.at(-2)?.dataset.count).toBe('1'); // yesterday
    expect(days.at(-11)?.dataset.count).toBe('2'); // ten days ago
    expect(days.at(-1)?.dataset.count).toBe('0'); // today, quiet
  });

  it('escapes dream and moment text instead of running it as HTML', async () => {
    const attack = '<img src=x onerror="window.__xss=1">';
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: year({
        dreams: [
          {
            dream: attack,
            status: 'active',
            mentionCount: 2,
            type: attack,
            mentionedAt: new Date().toISOString(),
          },
        ],
        emotionalJourney: [
          { date: new Date().toISOString(), emotion: attack, context: attack, intensity: 0.9 },
        ],
      }),
    });
    await settle(openYourYearWithFerni());
    expect(document.querySelector('#dreams-title')).not.toBeNull();
    expect(
      document.querySelector('.dream-text img, .dream-meta img, .timeline-item img')
    ).toBeNull();
    expect(document.querySelector('.dream-text')?.textContent).toBe(attack);
  });
});
