/**
 * The relationship record reaches each surface through the real wiring, not just the helpers.
 *
 * - Startup: initProgressiveFeatures() is what loads the record (startRelationshipFacts); if
 *   it doesn't, the home journey card says "Gathering our story." forever.
 * - What I'm Noticing: its footer shows the record's days and count, not the numbers that
 *   /api/insights sends alongside (the memory profile's 777).
 * - The journey dialog: opened while the record is on its way it says so, with no 0, and fills
 *   in where it stands when the record arrives.
 * - A failed first load is tried once more, so the card is not stuck on "can't reach".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RECORD = {
  stage: 'established',
  metrics: { totalConversations: 59, daysSinceFirstMeeting: 327, currentStreak: 0, longestStreak: 9 },
  firstMeetingDate: '2025-12-24T10:00:00.000Z',
};
const INSIGHTS = { relationship: { daysTogether: 317, conversations: 777, milestone: 'Ten months of us' } };

type Reply = { ok: boolean; status: number; data?: unknown; error?: string };
let progressReply: () => Promise<Reply>;

async function load() {
  vi.resetModules();
  vi.doMock('../../src/utils/api.js', () => ({
    apiGet: async (path: string): Promise<Reply> => {
      if (path === '/api/relationship/progress') return progressReply();
      if (path.startsWith('/api/insights/')) return { ok: true, status: 200, data: INSIGHTS };
      return { ok: false, status: 404, error: 'not here' };
    },
  }));
  vi.doMock('../../src/ui/better-than-human.ui.js', () => ({ playMicroExpression: vi.fn() }));
  const i18n = await import('../../src/i18n/index.js');
  await i18n.initI18n();
  return {
    t: i18n.t,
    ...(await import('../../src/services/relationship-stage.service.js')),
    ...(await import('../../src/ui/relationship-facts-view.js')),
  };
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ferni_user_id', 'user-1');
  document.body.innerHTML = '';
  progressReply = async () => ({ ok: true, status: 200, data: RECORD });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('app startup loads the record', () => {
  it('initProgressiveFeatures() brings the journey card from "Gathering" to the record', async () => {
    const m = await load();
    const { initProgressiveFeatures } = await import('../../src/services/progressive-features.service.js');
    const indicator = await import('../../src/ui/progress-indicator.ui.js');

    initProgressiveFeatures();

    await vi.waitFor(() => expect(m.relationshipKnown()).toBe(true), { timeout: 2000 });
    const card = document.querySelector('.progress-indicator')!;
    expect(text(card.querySelector('.progress-stage-name'))).toBe(m.getTranslatedStageName('established'));
    indicator.toggleExpanded();
    const values = [...card.querySelectorAll('.metric-value')].map((v) => v.textContent);
    expect(values.slice(0, 2)).toEqual(['59', '327']);
  });

  it('a failed first load is tried once more, 30 s later', async () => {
    vi.useFakeTimers();
    let calls = 0;
    progressReply = async () => (++calls === 1 ? { ok: false, status: 503, error: 'busy' } : { ok: true, status: 200, data: RECORD });
    const m = await load();

    m.startRelationshipFacts();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.relationshipStageService.factsStatus()).toBe('unavailable');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(m.relationshipStageService.factsStatus()).toBe('known');
    expect(m.relationshipStageService.getMetrics().totalConversations).toBe(59);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toBe(2); // once more, not a polling loop
  });
});

describe("What I'm Noticing", () => {
  it('its footer shows the record, not the numbers /api/insights sends', async () => {
    await load();
    const { getInsightsView } = await import('../../src/ui/insights-view.ui.js');

    getInsightsView().show();

    await vi.waitFor(() => expect(document.querySelector('.insights-milestone__stats')).not.toBeNull());
    const footer = text(document.querySelector('.insights-milestone__stats'));
    expect(footer).toContain('327 days');
    expect(footer).toContain('59 conversations');
    expect(footer).not.toContain('777');
    expect(footer).not.toContain('317');
  });
});

describe('the journey dialog', () => {
  // jsdom has no Web Animations; the dialog's open and close animations only need to finish
  const originalAnimate = Element.prototype.animate;
  beforeEach(() => {
    Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel: () => {} })) as unknown as typeof Element.prototype.animate;
  });
  afterEach(() => {
    Element.prototype.animate = originalAnimate;
  });

  it('opened while the record is on its way says so, then fills in where it stands', async () => {
    let arrive: (reply: Reply) => void = () => {};
    progressReply = () => new Promise((resolve) => (arrive = resolve));
    const m = await load();
    const { openJourney, closeJourney } = await import('../../src/ui/journey.ui.js');
    const loading = m.relationshipStageService.loadFromBackend();

    openJourney();
    const modal = document.querySelector('.journey-modal')!;
    const stats = () => [...modal.querySelectorAll('.journey-stat__value')].slice(0, 2).map((v) => text(v));
    expect(text(modal.querySelector('.journey-stage-name'))).toBe(m.t('relationshipFacts.loading'));
    expect(stats()).toEqual(['', '']); // no 0 from this device
    expect(modal.querySelector('.journey-stats-row')?.getAttribute('aria-busy')).toBe('true');
    expect(modal.querySelector('.journey-map-section')).toBeNull();

    arrive({ ok: true, status: 200, data: RECORD });
    await loading;

    expect(document.querySelector('.journey-modal')).toBe(modal); // the same dialog, updated in place
    expect(stats()).toEqual(['59', '327']);
    expect(text(modal.querySelector('.journey-stage-name'))).toBe(m.getTranslatedStageName('established'));
    expect(modal.querySelector('.journey-stats-row')?.getAttribute('aria-busy')).toBe('false');
    expect(modal.querySelectorAll('.journey-map-section')).toHaveLength(1);
    expect(modal.querySelector('.journey-next-stage')).not.toBeNull();

    // Closed, it stops following the record
    closeJourney();
    const later = { ...RECORD, metrics: { ...RECORD.metrics, totalConversations: 60 } };
    progressReply = async () => ({ ok: true, status: 200, data: later });
    await m.relationshipStageService.loadFromBackend();
    expect(stats()).toEqual(['59', '327']);
  });
});
