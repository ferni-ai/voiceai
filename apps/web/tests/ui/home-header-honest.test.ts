/**
 * The home screen says one consistent thing (app audit 2026-11-16, items 8,
 * 10, 11, 15, 17), against the real index.html markup:
 *
 * - the talk button names whoever the tap will call (it read "Talk to Ferni"
 *   with Alex picked, across reloads);
 * - the clock button is named for the panel it opens ("What I'm Noticing", not
 *   "daily practice"), and its count clears once that panel has been opened;
 * - the menu header and Our Story So Far greet with the same words at 04:50
 *   ("Still up?" beside "Good morning" before);
 * - a teammate's role shows once, in the pill: no surname, no subtitle or
 *   helper line restating it;
 * - before sign-in the header has one role label and no "Thinking" status.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPersona } from '../../src/config/personas.js';
import { t } from '../../src/i18n/index.js';
import { translateStaticDom } from '../../src/i18n/static-dom.js';
import { appState } from '../../src/state/app.state.js';
import { initControlsUI } from '../../src/ui/controls.ui.js';
import { engagementTriggerUI, RITUALS_SEEN_KEY } from '../../src/ui/engagement-trigger.ui.js';
import { dayPart, timeOfDayGreeting } from '../../src/i18n/time-of-day.js';

const INDEX_HTML = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

/** The real main screen from index.html, scripts removed. */
function loadMainScreen(): void {
  const doc = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  document.body.innerHTML = doc.body.innerHTML;
}

const talkButtonText = (): string | null | undefined =>
  document.querySelector('#connectBtn .btn-content')?.textContent;

/** jsdom has no Web Animations: every animation finishes at once. */
function stubAnimate(): void {
  const animate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel: vi.fn(),
    set onfinish(done: (() => void) | null) {
      if (done) queueMicrotask(done);
    },
  }));
  Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true });
}

beforeEach(stubAnimate);

afterEach(() => {
  appState.set('connection', 'disconnected');
  appState.set('selectedPersona', getPersona('ferni'));
  appState.set('activePersona', getPersona('ferni'));
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('the talk button follows the picked teammate', () => {
  const mount = (): void => {
    loadMainScreen();
    initControlsUI({ onConnect: vi.fn(), onDisconnect: vi.fn(), onMuteToggle: vi.fn() });
  };

  it('names Alex once Alex is picked, and Ferni again after', () => {
    mount();
    expect(talkButtonText()).toBe('Talk to Ferni');

    appState.set('selectedPersona', getPersona('alex-chen'));
    expect(talkButtonText()).toBe('Talk to Alex');

    appState.set('selectedPersona', getPersona('peter-john'));
    expect(talkButtonText()).toBe('Talk to Peter');

    appState.set('selectedPersona', getPersona('ferni'));
    expect(talkButtonText()).toBe('Talk to Ferni');
  });

  it('names the teammate kept from last time on load, and a static re-translation keeps it', () => {
    // connect() sends selectedPersona.id as the token persona_id: the button names that persona
    appState.set('selectedPersona', getPersona('alex-chen'));
    mount();
    expect(talkButtonText()).toBe('Talk to Alex');

    translateStaticDom(); // bindStaticDom runs this on every locale change
    expect(talkButtonText()).toBe('Talk to Alex');
  });
});

describe('the clock button under the talk button', () => {
  beforeEach(() => {
    localStorage.removeItem(RITUALS_SEEN_KEY);
    document.body.innerHTML = '<div class="controls-row"></div>';
    engagementTriggerUI.initialize({ onEngagementClick: vi.fn() });
  });
  afterEach(() => {
    engagementTriggerUI.updateBadges({ ritualsdue: 0 });
    engagementTriggerUI.destroy();
    localStorage.removeItem(RITUALS_SEEN_KEY);
  });

  const button = (): HTMLElement => document.getElementById('engagementTriggerBtn')!;
  const badgeShown = (): boolean =>
    document
      .getElementById('engagementBadge')!
      .classList.contains('engagement-trigger-btn__badge--visible');

  it('is named for the panel it opens', () => {
    expect(button().getAttribute('aria-label')).toBe("Open What I'm Noticing");
    expect(button().getAttribute('title')).toBe(t('insights.whatNoticing'));
    expect(button().getAttribute('aria-label')).not.toMatch(/daily practice/i);
  });

  it('clears its count once the panel has been opened, through a reload, until more come due', () => {
    engagementTriggerUI.updateBadges({ ritualsdue: 1 });
    expect(badgeShown()).toBe(true);

    button().click();
    expect(badgeShown()).toBe(false);

    // A reload builds the button again and re-reads the same due ritual
    engagementTriggerUI.destroy();
    document.body.innerHTML = '<div class="controls-row"></div>';
    engagementTriggerUI.initialize({ onEngagementClick: vi.fn() });
    engagementTriggerUI.updateBadges({ ritualsdue: 1 });
    expect(badgeShown()).toBe(false);

    engagementTriggerUI.updateBadges({ ritualsdue: 2 });
    expect(badgeShown()).toBe(true);
  });
});

describe('one time of day for every greeting', () => {
  it('buckets the hours once', () => {
    expect([0, 4, 5, 11, 12, 16, 17, 20, 21, 23].map(dayPart)).toEqual([
      'lateNight',
      'lateNight',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
      'night',
      'night',
    ]);
  });

  it('greets the same way in the menu header and Our Story So Far at 04:50', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 16, 4, 50));
    expect(timeOfDayGreeting()).toBe('Still up?');

    const { getSettingsMenuUI, initSettingsMenuUI } =
      await import('../../src/ui/settings-menu.ui.js');
    initSettingsMenuUI({});
    getSettingsMenuUI().show();
    const menuGreeting = document.querySelector('.settings-menu__header-eyebrow')?.textContent;
    getSettingsMenuUI().destroy();

    const { getYourStoryUI } = await import('../../src/ui/your-story-dashboard.ui.js');
    const story = getYourStoryUI() as unknown as { buildHeader(data: unknown): HTMLElement };
    const header = story.buildHeader({
      analytics: { daysTogether: 3, conversations: 2, streak: null },
      stage: { name: 'Getting started', tagline: '', progress: 0 },
      milestones: [],
    });
    const storyGreeting = header.querySelector('.your-story__title')?.textContent;

    expect(menuGreeting).toBe('Still up?');
    expect(storyGreeting).toBe(menuGreeting);
  });
});

describe('a teammate on the home screen', () => {
  it('shows the first name and the role once, in the pill', async () => {
    loadMainScreen();
    const { initCoachUI, dispose } = await import('../../src/ui/coach.ui.js');
    const { initMessageUI } = await import('../../src/ui/message.ui.js');
    initCoachUI();
    initMessageUI();

    const alex = getPersona('alex-chen');
    appState.set('activePersona', alex);

    const name = document.getElementById('personaName')!;
    await vi.waitFor(() => expect(name.textContent).toBe('Alex'));
    const pill = document.querySelector('#coach .ai-companion-label-text')!;
    expect(pill.textContent).toBe('Communication coach');
    // The pill's role is not said again above or below it
    const subtitle = document.getElementById('personaSubtitle')!.textContent ?? '';
    const helper = document.getElementById('helperText')!.textContent ?? '';
    for (const line of [subtitle, helper])
      expect(line.toLowerCase()).not.toContain('communication coach');

    // A teammate whose line is not the role keeps it
    appState.set('activePersona', getPersona('peter-john'));
    await vi.waitFor(() => expect(name.textContent).toBe('Peter'));
    expect(document.getElementById('personaSubtitle')!.textContent).toBe('Research & insights');
    dispose();
  });
});

describe('the header before sign-in', () => {
  it('has one role label and no "Thinking" status', () => {
    loadMainScreen();
    translateStaticDom();
    const header = document.querySelector('header.header')!;
    const text = header.textContent ?? '';
    expect(text.match(/life coach/gi) ?? []).toHaveLength(1);
    expect(document.querySelector('#coach .ai-companion-label')?.textContent).toBe('Life coach');
    expect(text).not.toMatch(/thinking/i);
  });
});
