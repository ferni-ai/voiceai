/**
 * Panels show no numbers that nothing measured.
 *
 * Before: Build a Ritual cited made-up study results ("31% (Harvard Business
 * Review)"), Music Together showed a random "N playing / X% completion",
 * What I've learned showed an "X% understanding" score computed from counts,
 * and How You're Feeling said "+5% from last month" for any improving trend.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api-helpers.js', () => ({
  getApiHeadersAsync: vi.fn().mockResolvedValue({ Authorization: 'Bearer t' }),
  apiFetch: vi.fn((url: string) => fetch(url)),
}));

const { getRitualBuilderUI } = await import('../../src/ui/ritual-builder.ui.js');
const { musicDashboard } = await import('../../src/ui/music-dashboard.ui.js');
const { getCognitiveInsightsUI } = await import('../../src/ui/cognitive-insights.ui.js');
const { showWellbeingDashboard, cleanupWellbeingDashboard } =
  await import('../../src/ui/wellbeing-dashboard.ui.js');
const { t } = await import('../../src/i18n/index.js');

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Build a Ritual templates', () => {
  it('cite no study results', () => {
    Element.prototype.animate ??= vi.fn(() => ({}) as Animation);
    getRitualBuilderUI().show();

    const cards = document.querySelectorAll('.ritual-builder__template-card');
    expect(cards.length).toBeGreaterThan(0);
    const text = document.querySelector('.ritual-builder')?.textContent ?? '';
    expect(text).not.toMatch(/Harvard|Berkeley|Dominican|\d+%|3x more likely/);
  });
});

describe('Music Together daily challenge', () => {
  it('shows no participant count or completion rate', () => {
    const dash = musicDashboard as unknown as {
      profileData: unknown;
      renderDailyChallenge(): string;
    };
    dash.profileData = {
      // An older server still sends the random numbers; they must not render.
      dailyChallenge: {
        id: 'daily-2026-10-12',
        date: '2026-10-12',
        type: 'speed-round',
        title: 'Speed round',
        description: 'Name that tune',
        instructions: '',
        xpReward: 50,
        participantCount: 437,
        completionRate: 0.61,
      },
      challengeStats: { currentStreak: 0 },
    };

    const html = dash.renderDailyChallenge();

    expect(html).toContain('Speed round');
    expect(html).not.toContain('437');
    expect(html).not.toContain('61%');
  });
});

describe("What I've learned", () => {
  it('shows the real conversation count and no understanding score', () => {
    getCognitiveInsightsUI().show({
      memories: [{ id: 'a', type: 'fact', content: 'has a dog', confidence: 0.9, source: 'Ferni' }],
      patterns: [],
      totalInteractions: 7,
    });

    const score = document.querySelector('.cognitive-insights__score');
    expect(score?.textContent).toContain('7');
    expect(score?.textContent).not.toContain('%');
    expect(document.querySelector('.cognitive-insights__score-ring')).toBeNull();
  });
});

describe('How You are Feeling', () => {
  const NOW = '2026-10-03T12:34:56.000Z';
  const dashboard = {
    userId: 'u',
    hasData: true,
    currentState: {
      mood: 0.8,
      energy: null,
      anxiety: null,
      connection: null,
      purpose: null,
      sleep: null,
      lastUpdated: NOW,
    },
    trends: { period: 'week', direction: 'improving', changedDimensions: ['mood'] },
    insights: [],
    warnings: [],
    streaks: { currentDays: 1, bestDays: 1, lastCheckIn: NOW },
  };

  function respond(trendsStatus: number): void {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/trends')) {
        const body = trendsStatus === 200
          ? { userId: 'u', period: 'month', averages: {}, dataPoints: [
              { date: '2026-10-01', mood: 0.6 },
              { date: '2026-10-02', mood: 0.8 },
            ] }
          : { error: 'boom' };
        return new Response(JSON.stringify(body), { status: trendsStatus });
      }
      return new Response(JSON.stringify(dashboard), { status: 200 });
    }) as typeof fetch;
  }

  afterEach(() => cleanupWellbeingDashboard());

  it('names an improving trend without inventing a percentage', async () => {
    respond(200);
    await showWellbeingDashboard();

    const section = document.querySelector('.wellbeing-score-section')?.textContent ?? '';
    expect(section).toContain(t('wellbeing.improving'));
    expect(section).not.toMatch(/last month|\+5/);
  });

  it('says the trend failed to load instead of drawing a flat line', async () => {
    respond(500);
    await showWellbeingDashboard();

    const spark = document.querySelector('.wellbeing-dimension-card__sparkline');
    expect(spark?.textContent).toContain(t('wellbeing.trendUnavailable'));
    expect(spark?.querySelector('svg')).toBeNull();
  });
});
