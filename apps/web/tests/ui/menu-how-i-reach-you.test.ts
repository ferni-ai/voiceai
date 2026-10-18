/**
 * "How I reach you": the row where a person adds the phone Ferni texts or calls.
 *
 * 2026-10-17, the founder: "I don't see where I setup my profile maybe we need to
 * make that more clear? On brand and on message?" The screen existed, as "Staying
 * in Touch", the last row of the collapsed "Let's Practice" section. It is now the
 * first row of the menu, with a line saying what's inside, and it opens that screen.
 * On a phone it is also in the "What do you need?" sheet, one tap from the main screen.
 *
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const locale = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(__dirname, `../../src/i18n/locales/${name}.json`), 'utf8'));
const enUS = locale('en-US');
const lookup = (tree: Record<string, unknown>, key: string): string | undefined => {
  const value = key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }, tree);
  return typeof value === 'string' ? value : undefined;
};

vi.mock('../../src/i18n/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/i18n/index.js')>()),
  t: (key: string) => lookup(enUS, key) ?? key,
}));

const contactScreen = vi.hoisted(() => ({ openContactSettings: vi.fn() }));
vi.mock('../../src/ui/contact-settings.ui.js', () => contactScreen);

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');
const { openContactSettings } = await import('../../src/ui/lazy-screens.js');
const sheet = await import('../../src/ui/mobile-bottom-sheet.ui.js');

const rows = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('.settings-menu__item[data-action="contact-settings"]'),
];

describe('menu: How I reach you', () => {
  beforeEach(() => {
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    // As app.ts wires it: the row opens the contact screen through lazy-screens
    initSettingsMenuUI({ onContactSettingsClick: () => void openContactSettings() });
    getSettingsMenuUI().show();
  });

  afterEach(() => {
    getSettingsMenuUI().destroy();
    vi.restoreAllMocks();
    contactScreen.openContactSettings.mockClear();
  });

  it("is the first row of the menu, labelled in Ferni's voice with what it holds", () => {
    expect(rows()).toHaveLength(1); // no second copy left in "Let's Practice"
    const row = rows()[0]!;
    const firstRow = document.querySelector('.settings-menu__nav .settings-menu__item');
    expect(firstRow).toBe(row);
    expect(row.querySelector('.settings-menu__label')?.textContent).toBe('How I reach you');
    expect(row.querySelector('.settings-menu__hint')?.textContent).toBe(
      'Your number, and whether I text, call or leave a note in the app'
    );
    expect(row.getAttribute('aria-label')).toBe('How I reach you');
    // Visible without opening a section
    expect(row.closest('.settings-menu__section-content')).toBeNull();
  });

  it('opens the contact screen', async () => {
    expect(contactScreen.openContactSettings).not.toHaveBeenCalled();
    rows()[0]!.click();
    await vi.waitFor(() => expect(contactScreen.openContactSettings).toHaveBeenCalledTimes(1));
  });
});

describe('phone sheet: How I reach you', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    window.matchMedia = ((query: string) => ({
      matches: query === '(max-width: 768px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    sheet.initMobileBottomSheet();
  });

  afterEach(() => {
    sheet.disposeMobileBottomSheet();
    contactScreen.openContactSettings.mockClear();
  });

  it('opens the contact screen in one tap from the sheet', async () => {
    sheet.open();
    const action = document.querySelector<HTMLElement>(
      '.mobile-bottom-sheet__action[data-action="reach-me"]'
    );
    expect(action?.textContent).toBe('How I reach you');
    expect(contactScreen.openContactSettings).not.toHaveBeenCalled();
    action!.click();
    await vi.waitFor(() => expect(contactScreen.openContactSettings).toHaveBeenCalledTimes(1));
  });
});

describe('How I reach you copy', () => {
  const keys = ['menu.items.howIReachYou', 'menu.items.howIReachYouHint'];

  it.each(['en-US', 'en-GB'])('%s has both strings, with no "AI" and no cold words', (name) => {
    const tree = locale(name);
    for (const key of keys) {
      const text = lookup(tree, key);
      expect(text, `${name} ${key}`).toBeTruthy();
      expect(text).not.toMatch(/\bAI\b/);
      expect(text).not.toMatch(/settings|preferences|contact info|profile/i);
      expect(text).not.toMatch(/[—…]/); // voice text rules: tap-to-hear reads it aloud
    }
  });
});
