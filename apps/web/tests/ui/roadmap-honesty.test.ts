/**
 * What's Coming (roadmap panel) shows no invented progress or seed amounts.
 *
 * The three features are ideas nobody is building (the group coaching and
 * video backends were last touched in Dec 2025), so no feature may be shown as
 * "Growing" / "We're actively building this" or "Budding" / "Almost ready to
 * bloom". The seed rules must match the server (src/services/seeds/earn.ts:
 * 5 a day, 25 at 7 days, 100 at 30 days), not the old +1 / +5 / +15.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: false, data: null })),
  apiPost: vi.fn(async () => ({ ok: false, data: null })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { getRoadmapPanelUI } from '../../src/ui/roadmap-panel.ui.js';
import { roadmapService, smartPromptTracker } from '../../src/services/roadmap.service.js';
import { containsWords } from '../../src/utils/contains-words.js';

const INVENTED_PROGRESS = [
  'Growing',
  'Budding',
  'Blooming Soon',
  "We're actively building this",
  'Almost ready to bloom',
  'Launching very soon',
];

describe("What's Coming", () => {
  beforeEach(() => {
    Element.prototype.animate = vi.fn() as unknown as Element['animate'];
  });

  afterEach(() => {
    getRoadmapPanelUI().hide();
    document.body.replaceChildren();
  });

  it('claims no build progress for any feature', async () => {
    await getRoadmapPanelUI().show();
    const text = document.body.textContent ?? '';

    for (const claim of INVENTED_PROGRESS) expect(text).not.toContain(claim);
    expect(document.querySelector('.roadmap-panel__legend')).toBeNull();
    expect(roadmapService.getAllFeatures().map((f) => f.stage)).toEqual(['seed', 'seed', 'seed']);
  });

  it('states the seed amounts the server pays', async () => {
    await getRoadmapPanelUI().show();
    (document.querySelector('.roadmap-panel__seed-info-trigger') as HTMLElement).click();
    const tooltip = document.querySelector('.roadmap-panel__seeds-tooltip')?.textContent ?? '';

    expect(tooltip).toContain('First conversation of the day: +5 seeds');
    expect(tooltip).toContain('7-day streak: +25 seeds');
    expect(tooltip).toContain('30-day streak: +100 seeds');
    expect(tooltip).not.toContain('+1 seed');
    expect(tooltip).not.toContain('+15 seeds');
  });
});

describe('roadmap recommendations', () => {
  it('match whole words, so "therapist" is not a mention of "api"', () => {
    expect(containsWords('my therapist said so', 'api')).toBe(false);
    expect(containsWords('I want to use your API', 'api')).toBe(true);
    expect(containsWords('my apple watch died', 'apple watch')).toBe(true);
    expect(containsWords('a person with a reason', 'son')).toBe(false);
  });

  it('do not tell someone who talks about their therapist that they mentioned "api"', () => {
    // Each call counts a rule once; developer-portal needs two mentions.
    smartPromptTracker.analyzeText('My therapist helped.');
    smartPromptTracker.analyzeText('My therapist is great.');
    const devPortal = smartPromptTracker
      .getRecommendations()
      .find((r) => r.featureId === 'developer-portal');
    expect(devPortal).toBeUndefined();
  });
});
