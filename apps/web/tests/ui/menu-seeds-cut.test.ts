/**
 * Seeds are cut from the menu (Seth, 2026-10-17: "cut seeds"). Bring a friend
 * stays, and "Account & Billing" becomes "Chip in" on Venmo while Ferni is free.
 *
 * Before: the menu opened on a seeds card (balance, "N days in a row", garden,
 * gift, invite). Seeds only bought garden items and roadmap votes, the balance
 * was split across two ledgers, and gifting sent the typed email as a uid. The
 * "Account & Billing" row opened a modal that said "chip in on Venmo" with no
 * way to do it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');

const onShareFerniClick = vi.fn();
const onSupportFerniClick = vi.fn();
const onBillingPortalClick = vi.fn();

function openMenu(): void {
  initSettingsMenuUI({ onShareFerniClick, onSupportFerniClick, onBillingPortalClick });
  getSettingsMenuUI().show();
}

function row(action: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.settings-menu [data-action="${action}"]`);
}

afterEach(() => {
  getSettingsMenuUI().destroy();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('the menu without seeds', () => {
  it('has no seeds card, balance, streak, garden or gift', () => {
    openMenu();
    expect(document.querySelector('.settings-menu [data-seeds-card]')).toBeNull();
    expect(document.querySelector('.settings-menu [class*="seeds-"]')).toBeNull();
    for (const action of ['garden', 'gift', 'invite']) {
      expect(row(action), action).toBeNull();
    }
  });

  it('keeps Bring a friend', () => {
    openMenu();
    row('share-ferni')?.click();
    expect(onShareFerniClick).toHaveBeenCalledTimes(1);
  });
});

describe('Chip in', () => {
  it('replaces Account & Billing when the Venmo chip-in is configured', () => {
    vi.stubEnv('VITE_VENMO_CHIP_IN', 'true');
    vi.stubEnv('VITE_VENMO_HANDLE', 'ferni-test');
    openMenu();

    expect(row('billing')).toBeNull();
    const chipIn = row('support-ferni');
    expect(chipIn?.closest('.settings-menu__quick-actions')).not.toBeNull();
    expect(chipIn?.textContent?.trim()).toBe('Chip In');

    chipIn?.click(); // opens the Venmo card (lazy-screens openSupportFerni)
    expect(onSupportFerniClick).toHaveBeenCalledTimes(1);
  });

  it('leaves Account & Billing alone when no Venmo handle is configured', () => {
    vi.stubEnv('VITE_VENMO_CHIP_IN', 'true');
    vi.stubEnv('VITE_VENMO_HANDLE', '');
    openMenu();

    expect(row('support-ferni')).toBeNull();
    row('billing')?.click();
    expect(onBillingPortalClick).toHaveBeenCalledTimes(1);
  });
});
