/**
 * The menu shows exactly the rows Seth decided on (2026-10-17: "drop the
 * locks, cut seeds, go ahead on the rest"), everywhere a panel can be opened.
 *
 * Before: Set the Mood, Meet More Friends, Home & Family, Recognizing You,
 * Music Together, Knowledge Quiz, Build a Ritual and What's Coming all
 * rendered; the integration tiles showed Oura, Eight Sleep, Ecobee, Spotify,
 * Apple Health and a Vibe tile that always said "connected"; voice and
 * notification deep links still opened Music, the Quiz, Home & Family, Voice ID
 * and Predictions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn().mockRejectedValue(new Error('offline')),
  apiPost: vi.fn(),
}));

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { memoryControlEnabled } = await import('../../src/ui/memory/remembered.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');

const HIDDEN_ROWS = [
  'vibe-controller',
  'discover-agents',
  'household-members',
  'voice-id-settings',
  'music-dashboard',
  'knowledge-quiz',
  'ritual',
  'pattern-insights',
  'whats-growing',
  'predictions',
  'spotify',
  'oura-settings',
  'eight-sleep-settings',
  'apple-health-settings',
  'wearable-settings',
];

/** Every row of the menu body, in order, for a user with everything unlocked. */
const VISIBLE_ROWS = [
  // How I reach you, above the sections (tests/ui/menu-how-i-reach-you.test.ts)
  'contact-settings',
  // Let's Practice
  'hub',
  'commands',
  'what-i-do-for-you',
  'calendar-settings',
  'notifications',
  'outreach-schedule',
  // Our Story
  'your-story',
  'trust-dashboard',
  'wellbeing',
  'memory-lane',
  'history',
  'your-year',
  // Let's Do Something
  'journal',
  'play-games',
  // Your World
  'contacts',
  'family-callers',
  'all-connections',
  // Settings
  'personal-settings',
  'theme',
  'toggle-transcription',
  'toggle-sounds',
  'billing',
  ...(memoryControlEnabled() ? ['cognitive'] : []),
  'export',
  // Footer
  'share-ferni',
  'help',
  'sign-out',
];

function bodyRows(): string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.settings-menu__nav .settings-menu__item[data-action]'
    ),
  ]
    .filter((el) => !el.closest('.settings-menu__section--pinned'))
    .map((el) => el.dataset.action ?? '');
}

describe('desktop settings menu', () => {
  beforeEach(() => {
    // Stage locks are out of the picture: a long-time user with everything unlocked
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    // Pins saved before the hides must not bring a hidden row back
    localStorage.setItem(
      'ferni_menu_pinned',
      JSON.stringify(['hub', 'household-members', 'predictions', 'voice-id-settings'])
    );
    initSettingsMenuUI({});
    getSettingsMenuUI().show();
  });

  afterEach(() => {
    getSettingsMenuUI().destroy();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders exactly the decided rows, in order', () => {
    expect(bodyRows()).toEqual(VISIBLE_ROWS);
  });

  it('renders no hidden row anywhere, pinned or not', () => {
    for (const action of HIDDEN_ROWS) {
      expect(document.querySelector(`.settings-menu [data-action="${action}"]`), action).toBeNull();
    }
    const pinned = [
      ...document.querySelectorAll<HTMLElement>(
        '.settings-menu__section--pinned .settings-menu__item[data-action]'
      ),
    ].map((el) => el.dataset.action);
    expect(pinned).toEqual(['hub']);
  });
});

describe('mobile bottom sheet', () => {
  const width = window.innerWidth;
  afterEach(async () => {
    const { disposeMobileBottomSheet } = await import('../../src/ui/mobile-bottom-sheet.ui.js');
    disposeMobileBottomSheet();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  });

  it('offers exactly how i reach you, settings, team, calendar, history, people, sound and insights', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const { initMobileBottomSheet } = await import('../../src/ui/mobile-bottom-sheet.ui.js');
    initMobileBottomSheet();

    const actions = [
      ...document.querySelectorAll<HTMLElement>('.mobile-bottom-sheet__action[data-action]'),
    ].map((el) => el.dataset.action);
    expect(actions).toEqual([
      'reach-me',
      'settings',
      'team',
      'calendar',
      'history',
      'people',
      'sound',
      'insights',
    ]);
  });
});

describe('deep links to hidden panels do nothing', () => {
  const opened: string[] = [];
  const EVENTS = [
    'ferni:open-music',
    'ferni:open-quiz',
    'ferni:open-household',
    'ferni:open-voice-id',
    'ferni:open-patterns',
    'ferni:open-predictions',
    'ferni:open-calendar',
  ];
  const record = (e: Event) => opened.push(e.type);

  beforeEach(() => {
    opened.length = 0;
    EVENTS.forEach((name) => window.addEventListener(name, record));
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => EVENTS.forEach((name) => window.removeEventListener(name, record)));

  it('voice show_view opens nothing for a hidden panel, and still opens a visible one', async () => {
    const { processVoiceUserEvent } = await import('../../src/services/voice-events.service.js');
    const views = ['music', 'quiz', 'household-members', 'voice-id', 'patterns'];
    views.forEach((view, i) =>
      processVoiceUserEvent({ type: 'show_view', data: { view }, timestamp: `t-hidden-${i}` })
    );
    expect(opened).toEqual([]);

    processVoiceUserEvent({
      type: 'show_view',
      data: { view: 'calendar' },
      timestamp: 't-visible',
    });
    expect(opened).toEqual(['ferni:open-calendar']);
  });

  it('?panel=predictions and a prediction notification open nothing', async () => {
    const { openPanelForNotificationType, openPanelFromUrl } =
      await import('../../src/services/notification-navigation.js');

    window.history.replaceState({}, '', '/?panel=predictions');
    expect(openPanelFromUrl()).toBe(false);
    expect(window.location.search).toBe('');

    expect(openPanelForNotificationType('prediction_result')).toBe(false);
    expect(opened).toEqual([]);
  });
});

describe('Everything Connected', () => {
  afterEach(async () => {
    const { connectedLifeUI } = await import('../../src/ui/connected-life.ui.js');
    connectedLifeUI.hide();
    document.querySelectorAll('.connected-life-overlay').forEach((el) => el.remove());
  });

  it('shows only the Google Calendar tile, on its own tab', async () => {
    const { showConnectedLife } = await import('../../src/ui/connected-life.ui.js');
    await showConnectedLife();

    const tiles = [
      ...document.querySelectorAll<HTMLElement>('.connected-life-integration[data-integration]'),
    ].map((el) => el.dataset.integration);
    const tabs = [...document.querySelectorAll<HTMLElement>('.connected-life-tab')].map(
      (el) => el.dataset.tab
    );
    expect(tiles).toEqual(['google-calendar']);
    expect(tabs).toEqual(['calendar']);
    expect(document.querySelector('.connected-life-status.connected')).toBeNull();
  });
});
