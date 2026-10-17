/**
 * Menu panels look and read like one family.
 *
 * The UI audit (2026-10-11) found the phone menu's "Past chats" opened a panel
 * titled "Your Journey" and "How you're doing" opened "What I've Learned", and
 * that Meet Your Team laid its header out in columns: the base Modal's own
 * styles were never injected, so the shared engagement .ferni-modal__header
 * (flex, space-between) styled it instead.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

const { SHARED_STYLES } = await import('../src/ui/engagement-components.js');
const { t } = await import('../src/i18n/index.js');

// jsdom has no Web Animations API; the modal's fade is decoration here
HTMLElement.prototype.animate ??= vi.fn() as unknown as HTMLElement['animate'];

const LOCALES_DIR = join(__dirname, '..', 'src', 'i18n', 'locales');
const LOCALES = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));

/** Menu label key → the key of the title on the panel it opens. */
const MENU_TO_PANEL_TITLE: Array<[string, string]> = [
  ['menu.mobileSheet.actions.history', 'conversationHistory.title'],
  ['menu.mobileSheet.actions.insights', 'cognitive.whatIveLearned'],
];

function valueOf(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }, locale);
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('menu labels name the panel they open', () => {
  for (const file of LOCALES) {
    it(`${file}: each label matches its panel title (ignoring case)`, () => {
      const locale = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));
      const lang = file.replace('.json', '');
      for (const [menuKey, panelKey] of MENU_TO_PANEL_TITLE) {
        const label = valueOf(locale, menuKey);
        const title = valueOf(locale, panelKey);
        expect(typeof label, menuKey).toBe('string');
        expect(typeof title, panelKey).toBe('string');
        expect((label as string).toLocaleLowerCase(lang), `${menuKey} vs ${panelKey}`).toBe(
          (title as string).toLocaleLowerCase(lang)
        );
      }
    });
  }

  it('the history panel shows the conversation-history title', async () => {
    const { getConversationHistoryUI } = await import('../src/ui/conversation-history.ui.js');
    getConversationHistoryUI().showLoading();
    const title = document.querySelector('.history__title')?.textContent?.trim();
    expect(title).toBe(t('conversationHistory.title'));
    expect(title?.toLowerCase()).toBe(t('menu.mobileSheet.actions.history').toLowerCase());
  });
});

describe('Meet Your Team header', () => {
  it('uses the base modal header layout, not the shared flex row', async () => {
    const shared = document.head.appendChild(document.createElement('style'));
    shared.textContent = SHARED_STYLES;
    const { showTeamIntro, hideTeamIntro } = await import('../src/ui/team-intro.ui.js');

    showTeamIntro();
    const header = document.querySelector<HTMLElement>('.ferni-modal__header');
    expect(header).not.toBeNull();
    expect(document.getElementById('ferni-modal-styles')).not.toBeNull();
    expect(getComputedStyle(header as HTMLElement).display).not.toBe('flex');
    hideTeamIntro();
  });
});
