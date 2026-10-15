/**
 * Show Me Around (menu item 34): every tour step that points at something
 * points at an element the app shell really has.
 *
 * The steps aimed at '.waveform', '.persona-switcher' and '.engagement-trigger',
 * none of which exists, so the tour highlighted nothing. Here the real
 * index.html body is the page and the real onboarding UI walks its steps.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

const SHELL = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');

// The shared setup empties the body between tests: each test gets the shell and a fresh tour
beforeEach(async () => {
  vi.resetModules();
  await (await import('../../src/i18n/index.js')).initI18n();
  document.body.innerHTML = new DOMParser().parseFromString(SHELL, 'text/html').body.innerHTML;
});

describe('Show Me Around tour', () => {
  it('every step selector is an element in the app shell', async () => {
    const { STEP_HIGHLIGHTS, STEP_IDS } = await import('../../src/ui/onboarding.ui.js');
    const targets = Object.entries(STEP_HIGHLIGHTS);

    expect(targets.length).toBeGreaterThan(0);
    for (const [stepId, selector] of targets) {
      expect(STEP_IDS).toContain(stepId);
      expect({ stepId, found: !!selector && !!document.querySelector(selector) }).toEqual({
        stepId,
        found: true,
      });
    }
  });

  it('walking the tour highlights each target on its own step', async () => {
    const { getOnboardingUI, STEP_HIGHLIGHTS, STEP_IDS } =
      await import('../../src/ui/onboarding.ui.js');
    const tour = getOnboardingUI();
    tour.start();

    const highlighted: Array<string | null> = [];
    for (let i = 0; i < STEP_IDS.length; i++) {
      highlighted.push(document.querySelector('.onboarding-highlight')?.id ?? null);
      if (i < STEP_IDS.length - 1) tour.next();
    }
    tour.skip();

    const expected = STEP_IDS.map((id) => STEP_HIGHLIGHTS[id]?.replace('#', '') ?? null);
    expect(highlighted).toEqual(expected);
    expect(highlighted.filter(Boolean)).toHaveLength(Object.keys(STEP_HIGHLIGHTS).length);
  });

  it('no step names streaks or calls the team AI', async () => {
    const { getOnboardingUI, STEP_IDS } = await import('../../src/ui/onboarding.ui.js');
    const tour = getOnboardingUI();
    tour.start();
    const text: string[] = [];
    for (let i = 0; i < STEP_IDS.length; i++) {
      text.push(document.querySelector('.onboarding__card')?.textContent ?? '');
      if (i < STEP_IDS.length - 1) tour.next();
    }
    tour.skip();

    expect(text.filter((card) => card.trim().length > 0)).toHaveLength(STEP_IDS.length);
    expect(text.join(' ')).not.toMatch(/\bAI\b|streak/i);
  });
});
