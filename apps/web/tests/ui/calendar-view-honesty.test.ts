/**
 * The practice view must not state facts about the person it can't back with their data:
 * no random "Maya notices" wisdom when there's no pattern, and no relationship claims
 * attached to an event just because its title says "dinner".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ success: false })),
  apiPost: vi.fn(async () => ({ success: false })),
  getUserId: vi.fn(() => 'user-1'),
}));

import { calendarViewUI } from '../../src/ui/calendar-view.ui.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const view = calendarViewUI as any;

const apiView = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  orchestratingPersona: 'jordan',
  week: [],
  todayEvents: [],
  intentions: [],
  mayaNotices: null,
  crossPersonaInsights: [],
  stats: {},
  lastUpdated: new Date().toISOString(),
  ...overrides,
});

const quietWeek = { totalMeetings: 2, busiestDay: { day: 'Monday', meetings: 1 }, days: [] };
const busyWeek = { totalMeetings: 20, busiestDay: { day: 'Monday', meetings: 8 }, days: [] };

beforeEach(() => {
  view.isLoadingPracticeView = false;
  view.practiceViewData = null;
  view.weekData = quietWeek;
});

describe('Maya notice in the practice view', () => {
  it('shows nothing when the API found no pattern (no random wisdom)', () => {
    for (let i = 0; i < 5; i++) {
      view.practiceViewData = apiView({ mayaNotices: null });
      const html: string = view.renderPracticeView();
      expect(html).not.toContain('practice-whisper');
    }
  });

  it('shows nothing offline when the calendar data has no pattern either', () => {
    view.practiceViewData = null;
    const html: string = view.renderPracticeView();
    expect(html).not.toContain('practice-whisper');
  });

  it('still shows the API notice when there is one', () => {
    view.practiceViewData = apiView({
      mayaNotices: { message: 'Monday looks packed.', type: 'suggestion', confidence: 0.8 },
    });
    const html: string = view.renderPracticeView();
    expect(html).toContain('practice-whisper');
    expect(html).toContain('Monday looks packed.');
  });

  it('still derives a notice offline from a really busy calendar week', () => {
    view.weekData = busyWeek;
    view.practiceViewData = null;
    expect(view.generateMayaPatternNotice()).toEqual(expect.any(String));
  });
});

describe('event notes by title keyword', () => {
  const event = (title: string) => ({ id: 'e1', title, startTime: '', endTime: '' });

  it('makes no claim about the partner for dinner/family/partner events', () => {
    for (const title of ['Family dinner', 'Dinner with partner', 'Partner anniversary']) {
      expect(view.getEventEmotionalContext(event(title)), title).toBeNull();
    }
  });

  it('keeps the neutral suggestion on work meetings', () => {
    expect(view.getEventEmotionalContext(event('Weekly sync'))).not.toBeNull();
  });
});

describe('stats', () => {
  it('shows the empty state, not 0% or a trend, when the API has no stats', () => {
    view.practiceViewData = apiView({ stats: {} });
    const html: string = view.renderPracticeView();
    expect(html).toContain('practice-stats--empty');
    expect(html).not.toContain('0%');
  });

  it('shows only the stats the API computed', () => {
    view.practiceViewData = apiView({ stats: { followThroughPercent: 50 } });
    const html: string = view.renderPracticeView();
    expect(html).not.toContain('practice-stats--empty');
    expect(html).toContain('50%');
  });
});
