/**
 * Raw i18n keys reached the UI ("featureHints.teamHuddlesTitle") because some
 * modules called t() at import time, before initI18n() had loaded any
 * translations, and kept the returned key. They now store keys and translate
 * when they render.
 *
 * Each test reproduces the app's order: a fresh i18n module with nothing
 * loaded, import the module under test, then load the locale, then render.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../src/i18n/locales/en-US.json';

type I18n = typeof import('../src/i18n/index.js');

/** Look up a dotted key in the English strings. */
function en(key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      enUS
    );
  if (typeof value !== 'string') throw new Error(`No en-US string for ${key}`);
  return value;
}

/** Fresh module graph whose i18n has no translations loaded yet (as at app import). */
async function freshI18n(): Promise<I18n> {
  vi.resetModules();
  const i18n = await import('../src/i18n/index.js');
  expect(i18n.isInitialized()).toBe(false);
  return i18n;
}

const RAW_KEY = /^(featureHints|activity|growthJourney)\.[A-Za-z0-9_.]+$/;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('strings defined at import time are translated at render', () => {
  it('feature hint shows the translated title, not featureHints.teamHuddlesTitle', async () => {
    const i18n = await freshI18n();
    const hints = await import('../src/ui/feature-hints.ui.js');
    const { modalCoordinator } = await import('../src/services/modal-coordinator.service.js');
    await i18n.setLocale('en-US', { reload: false });
    modalCoordinator.simulateConversations(5);
    // jsdom has no Web Animations API; the hint animates in with it.
    const animation = { finished: Promise.resolve(), onfinish: null, cancel: vi.fn() };
    Element.prototype.animate = vi.fn(() => animation as unknown as Animation);
    const target = document.createElement('div');
    target.setAttribute('data-feature', 'team-huddle');
    document.body.appendChild(target);

    hints.showHint('team-huddle-intro');

    const title = document.querySelector('.hint-title');
    expect(title?.textContent).toBe(en('featureHints.teamHuddlesTitle'));
    expect(document.querySelector('.hint-message')?.textContent).toBe(
      en('featureHints.teamHuddlesMessage')
    );
    expect(document.body.textContent).not.toMatch(/featureHints\./);
  });

  it('activity filters show translated action labels, not activity.actionCall', async () => {
    const i18n = await freshI18n();
    const { getActivityUI } = await import('../src/ui/activity.ui.js');
    await i18n.setLocale('en-US', { reload: false });

    getActivityUI().initialize();

    const call = document.querySelector('.activity-filter[data-filter="call"]');
    expect(call?.textContent).toBe(en('activity.actionCall'));
    expect(document.body.textContent).not.toMatch(/activity\.action/);
  });

  it('growth journey season and milestones are translated, not growthJourney.* keys', async () => {
    const i18n = await freshI18n();
    const journey = await import('../src/services/growth-journey.service.js');
    await i18n.setLocale('en-US', { reload: false });

    const season = journey.getCurrentSeason();
    const milestones = journey.getAllMilestonesWithStatus();

    expect(season.name).not.toMatch(RAW_KEY);
    expect(season.description).not.toMatch(RAW_KEY);
    expect(milestones.length).toBeGreaterThan(0);
    for (const milestone of [...season.milestones, ...milestones]) {
      expect(milestone.title).not.toMatch(RAW_KEY);
      expect(milestone.message).not.toMatch(RAW_KEY);
      if (milestone.gift.title) expect(milestone.gift.title).not.toMatch(RAW_KEY);
    }
    const firstChat = milestones.find((m) => m.id.endsWith('-first-chat'));
    if (firstChat) expect(firstChat.title).toBe(en('growthJourney.milestones.reg.firstconvo'));
  });
});
