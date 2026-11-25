/**
 * One relationship, one set of numbers.
 *
 * Before (prod, 2026-11-16, one signed-in user, same minute): What I'm Noticing said
 * "317 days, 777 conversations" (the memory profile's counter), Our Story So Far said
 * "327 days together, 59 conversations, Deep Partnership" (the relationship arc), and the
 * home journey card said "New Friends, Need: 10 more conversations" with an empty ring (a
 * count kept only in this browser that nothing ever filled in, so it showed its defaults).
 *
 * Now every surface reads relationshipStageService, which holds the server's
 * sessions-together record (GET /api/relationship/progress). Until it arrives a surface says
 * so in words: never this device's 0, never "New Friends".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const DRIFTED = { conversations: 777, days: 317 }; // what the other sources said
const RECORD = {
  stage: 'established',
  stageNumber: 4,
  metrics: { totalConversations: 59, daysSinceFirstMeeting: 327, currentStreak: 0, longestStreak: 9 },
  firstMeetingDate: '2025-12-24T10:00:00.000Z',
};

type Reply = { ok: boolean; status: number; data?: unknown; error?: string };
let progressReply: () => Promise<Reply>;

/** A Your Story body whose own header carries the drifted numbers. */
function story() {
  return {
    success: true,
    data: {
      header: {
        greeting: 'Good morning',
        tagline: '',
        daysTogether: DRIFTED.days,
        totalConversations: DRIFTED.conversations,
        currentStreak: null,
        longestStreak: null,
      },
      relationship: { stage: 'trusted_advisor', stageLabel: 'Deep Partnership', progress: 100, nextStage: null, tagline: '' },
      energy: null,
      moodCalendar: null,
      lifeChapters: [],
      emotionalArc: null,
      yourWorld: null,
      openLoops: null,
      prediction: null,
      lastUpdated: '2026-11-16T04:50:00.000Z',
    },
  };
}

async function load() {
  vi.resetModules();
  vi.doMock('../../src/utils/api.js', () => ({
    apiGet: async (path: string): Promise<Reply> =>
      path === '/api/relationship/progress'
        ? progressReply()
        : { ok: true, status: 200, data: story() },
  }));
  const i18n = await import('../../src/i18n/index.js');
  await i18n.initI18n();
  const stageModule = await import('../../src/services/relationship-stage.service.js');
  const indicator = await import('../../src/ui/progress-indicator.ui.js');
  const view = await import('../../src/ui/relationship-facts-view.js');
  const yourStory = await import('../../src/services/your-story.service.js');
  return { t: i18n.t, ...stageModule, ...indicator, ...view, ...yourStory };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ferni_user_id', 'user-1');
  document.body.innerHTML = '';
  progressReply = async () => ({ ok: true, status: 200, data: RECORD });
});

describe('every surface shows the one relationship record', () => {
  it('Our Story So Far, the journey card and What I\'m Noticing show the same count, days and stage', async () => {
    const m = await load();
    m.initProgressIndicator();

    const result = await m.fetchYourStory(); // loads the record on the way
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const trustedGuide = m.getTranslatedStageName('established');

    // Our Story So Far: the record, not its own header's 777 / 317 / Deep Partnership
    expect(result.data.analytics).toMatchObject({ conversations: 59, daysTogether: 327 });
    expect(result.data.stage.name).toBe(trustedGuide);

    // Home journey card: the same stage, and the same numbers once opened
    const card = document.querySelector('.progress-indicator')!;
    expect(card.querySelector('.progress-stage-name')?.textContent).toBe(trustedGuide);
    m.toggleExpanded();
    const values = [...card.querySelectorAll('.metric-value')].map((v) => v.textContent);
    expect(values.slice(0, 2)).toEqual(['59', '327']);
    expect(card.textContent).not.toContain(m.getTranslatedStageName('first-meeting'));

    // What I'm Noticing footer
    const footer = m.relationshipStatsHtml('stats');
    expect(footer).toContain('327 days');
    expect(footer).toContain('59 conversations');
    expect(footer).not.toContain(String(DRIFTED.conversations));
  });

  it('the server record replaces whatever this browser counted before', async () => {
    localStorage.setItem(
      'ferni_relationship',
      JSON.stringify({ stage: 'first-meeting', metrics: { totalConversations: 0 } })
    );
    const m = await load();
    expect(await m.relationshipStageService.loadFromBackend()).toBe(true);
    expect(m.relationshipStageService.getStage()).toBe('established');
    expect(m.relationshipStageService.getMetrics().totalConversations).toBe(59);
  });
});

describe('an unknown record shows an honest state, never 0 or "New Friends"', () => {
  it('before the record arrives, the journey card says it is gathering our story', async () => {
    progressReply = () => new Promise(() => {}); // still on its way
    const m = await load();
    m.initProgressIndicator();
    void m.relationshipStageService.loadFromBackend();

    const card = document.querySelector('.progress-indicator')!;
    expect(card.textContent).toContain(m.t('relationshipFacts.loading'));
    expect(card.textContent).not.toContain(m.getTranslatedStageName('first-meeting'));
    expect(card.textContent).not.toMatch(/\d/);
    expect(m.relationshipStatsHtml('stats')).toBe('');
  });

  it('when the server cannot say, no surface shows a number', async () => {
    progressReply = async () => ({ ok: false, status: 500, error: 'boom' });
    const m = await load();
    m.initProgressIndicator();

    expect(await m.fetchYourStory()).toEqual({ status: 'error' });
    const card = document.querySelector('.progress-indicator')!;
    expect(card.textContent).toContain(m.t('relationshipFacts.unavailable'));
    expect(card.textContent).not.toContain(m.getTranslatedStageName('first-meeting'));
    expect(card.textContent).not.toMatch(/\d/);
    expect(m.relationshipNumber(0)).toBe('');
    expect(m.relationshipStatsHtml('stats')).toBe('');
  });

  it('a record missing its count is unknown, not filled with 0', async () => {
    const { parseRelationshipFacts } = await import('../../src/services/relationship-facts.js');
    const partial = { ...RECORD, metrics: { daysSinceFirstMeeting: 327, currentStreak: 0, longestStreak: 9 } };
    expect(parseRelationshipFacts(partial)).toBeNull();
    expect(parseRelationshipFacts({ ...RECORD, stage: 'soulmates' })).toBeNull();
    expect(parseRelationshipFacts({ error: 'Failed to get progress' })).toBeNull();
    expect(parseRelationshipFacts(RECORD)).toMatchObject({ stage: 'established', conversations: 59, daysTogether: 327 });
  });
});
