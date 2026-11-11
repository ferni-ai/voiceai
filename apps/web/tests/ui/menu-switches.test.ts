/**
 * The menu's on/off rows (See Our Words, Sound Effects) are real switches.
 *
 * Before: plain buttons with a CSS class for "on". A screen reader heard
 * "Sound Effects, button" with no state, and the signed-in walk compared an
 * aria-checked the rows never had, so it passed whether they toggled or not.
 * Here the real settings menu renders them and a click goes through its real
 * handler to the real sound and transcript settings.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');
const { soundUI } = await import('../../src/ui/sound.ui.js');
const { transcriptUI } = await import('../../src/ui/transcript.ui.js');
const { PREFERENCE_KEYS } = await import('../../src/config/storage-keys.js');
const { SOUND_SETTING_KEY } = await import('../../src/services/sound-director.js');

const row = (action: string): HTMLElement =>
  document.querySelector<HTMLElement>(`.settings-menu [data-action="${action}"]`)!;

/** What each switch shows "on" for, read from the setting itself. */
const SWITCHES: Array<[string, () => boolean]> = [
  ['toggle-sounds', () => !soundUI.getMuted()],
  ['toggle-transcription', () => transcriptUI.isEnabled()],
];

describe('menu on/off rows', () => {
  beforeEach(() => {
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    initSettingsMenuUI({});
    getSettingsMenuUI().show();
  });

  afterEach(() => {
    getSettingsMenuUI().destroy();
    vi.restoreAllMocks();
  });

  for (const [action, isOn] of SWITCHES) {
    it(`${action} is a switch whose aria-checked follows the setting through two taps`, () => {
      const el = row(action);
      expect(el.tagName).toBe('BUTTON'); // Enter and Space toggle it natively
      expect(el.getAttribute('role')).toBe('switch');
      const start = isOn();
      expect(el.getAttribute('aria-checked')).toBe(String(start));

      el.click();
      expect(isOn()).toBe(!start);
      expect(el.getAttribute('aria-checked')).toBe(String(!start));

      el.click();
      expect(isOn()).toBe(start);
      expect(el.getAttribute('aria-checked')).toBe(String(start));
    });
  }
});

// The app starts the sound and transcript modules ~100 ms after Home shows
// (app.ts deferredInit). Before: See Our Words held its own copy of the setting,
// "on" until its module started, so a menu opened in that gap showed a switch
// someone had turned off as on (the menu walk's reload check, ~1 in 3 runs).
// Nothing here starts either module: the menu must read the saved choice itself.
describe('menu on/off rows before their modules start', () => {
  const SAVED_OFF: Array<[string, () => void]> = [
    ['toggle-sounds', () => localStorage.setItem(SOUND_SETTING_KEY, 'off')],
    ['toggle-transcription', () => localStorage.setItem(PREFERENCE_KEYS.SHOW_TRANSCRIPTION, 'false')],
  ];

  afterEach(() => {
    getSettingsMenuUI().destroy();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  for (const [action, saveOff] of SAVED_OFF) {
    it(`${action} shows a saved "off" as off`, () => {
      localStorage.clear();
      vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
      vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
      initSettingsMenuUI({});
      getSettingsMenuUI().show();
      expect(row(action).getAttribute('aria-checked')).toBe('true'); // nothing saved: on (desktop)

      saveOff();
      getSettingsMenuUI().show(); // opening the menu re-reads every row
      expect(row(action).getAttribute('aria-checked')).toBe('false');
    });
  }
});
