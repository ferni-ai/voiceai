/**
 * Streak and unlock leftovers after menu wave 0 (Seth, 2026-10-11 TEAM_BY_NEED:
 * the whole team from the first call, no unlocks, no streak nudges; 2026-10-17
 * "drop the locks"), and a family-calls claim that isn't true.
 *
 * The 2026-10-18 menu re-audit found:
 * - This Year Together showed "Current Streak" / "Best: N" and "Team Members
 *   Unlocked", and a failed team lookup showed a made-up "Ferni" as unlocked.
 * - Family Phone Access said family are "recognized automatically" when they
 *   call; inbound calls never look a number up (CALLER_RECOGNITION is off, and
 *   even on it matches only an account's own verified phone).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mocks.apiGet,
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  getUserId: () => 'me-uid',
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// jsdom has no Web Animations API
Element.prototype.animate = vi.fn(() => ({
  finished: Promise.resolve(),
  onfinish: null,
  cancel: vi.fn(),
})) as never;

await (await import('../../src/i18n/index.js')).initI18n();
const { YourYearWithFerni } = await import('../../src/ui/your-year-with-ferni.ui.js');
const { FamilyIdentities } = await import('../../src/ui/family-identities.ui.js');

const LOCK_WORDS = /unlock|locked|streak|in a row|\bof 6\b|conversations? with Ferni/i;

function yearData(teamUnlocks: unknown[]) {
  return {
    userId: 'me-uid',
    startDate: '2025-10-18T00:00:00.000Z',
    conversationCounts: [
      { date: '2026-10-16', count: 1 },
      { date: '2026-10-17', count: 2 },
    ],
    emotionalJourney: [],
    teamUnlocks,
    dreams: [],
    commitments: [],
    milestones: [],
    topTopics: [],
    relationshipGrowth: { peopleTracked: 0, newConnections: 0, deepenedRelationships: 0 },
    stats: {
      totalConversations: 3,
      averageConversationsPerWeek: 1,
      mostActiveMonth: 'October 2026',
      dreamsTracked: 0,
      commitmentsKept: 0,
      // an older server still sends these; the page must not show them
      currentStreak: 2,
      longestStreak: 9,
      teamMembersUnlocked: 2,
    },
  };
}

describe('This Year Together', () => {
  let view: InstanceType<typeof YourYearWithFerni>;
  beforeEach(() => {
    view = new YourYearWithFerni();
  });
  afterEach(async () => {
    await view.close();
    document.body.innerHTML = '';
  });

  it('shows no streaks and no unlock count', async () => {
    mocks.apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: yearData([{ personaId: 'ferni', personaName: 'Ferni', primaryColor: '#4a6741' }]),
    });
    await view.open('me-uid');

    const stats = document.querySelector('.your-year-stats')?.textContent ?? '';
    expect(stats).toContain('3'); // conversations still show
    expect(stats).not.toContain('9');
    expect(document.querySelector('.your-year-modal')?.textContent).not.toMatch(LOCK_WORDS);
    expect(document.querySelectorAll('.your-year-stat-card')).toHaveLength(2);
  });

  it('says it could not load the team instead of claiming anyone was unlocked', async () => {
    mocks.apiGet.mockResolvedValue({ ok: true, status: 200, data: yearData([]) });
    await view.open('me-uid');

    const team = document.querySelector('[aria-labelledby="team-title"]');
    expect(team?.querySelector('.team-member')).toBeNull();
    expect(team?.querySelector('.your-year-team-empty')?.textContent).toBe(
      "Couldn't load your team just now."
    );
    expect(team?.textContent).not.toMatch(LOCK_WORDS);
  });
});

describe('Family Phone Access', () => {
  it('does not promise that family are recognized when they call', async () => {
    mocks.apiGet.mockResolvedValue({ ok: true, status: 200, data: { identities: [] } });
    await FamilyIdentities.show();

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/recogni[sz]ed automatically/i);
    expect(text).toContain("Ferni doesn't recognize callers by their number yet");
  });

  it('promises no check-in calls (FAMILY_CHECKIN_CALLS is off by default)', async () => {
    mocks.apiGet.mockResolvedValue({ ok: true, status: 200, data: { identities: [] } });
    await FamilyIdentities.show();

    const intro = `${document.querySelector('.family-modal__subtitle')?.textContent ?? ''} ${
      document.querySelector('.family-empty__text')?.textContent ?? ''
    }`;
    expect(intro).toContain('The people who matter to you');
    expect(intro).not.toMatch(/check in|check-in/i);
  });

  for (const locale of ['en-US', 'en-GB']) {
    it(`${locale} copy makes no automatic-recognition claim`, () => {
      const raw = readFileSync(
        join(__dirname, '..', '..', 'src', 'i18n', 'locales', `${locale}.json`),
        'utf8'
      );
      const family = JSON.stringify((JSON.parse(raw) as Record<string, unknown>).familyIdentities);
      expect(family).not.toMatch(/recogni[sz]ed automatically/i);
    });
  }
});
