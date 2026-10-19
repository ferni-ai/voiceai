/**
 * Your Day (Hub), Trust & Growth and Make It Yours are modal dialogs.
 *
 * 2026-10-18 UI audit: all three opened as plain divs: no role, no name, no
 * Escape on the Hub or Make It Yours, and Tab walked out into the page behind.
 * Each now goes through asModalDialog, so it is named by its heading, Escape
 * closes it, and the page-wide dialog-focus handler moves focus in and traps Tab.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: true, status: 200, data: { hasData: false } })),
  apiPost: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
}));
vi.mock('../../src/ui/ferni-hub-data.js', () => ({
  fetchHubData: vi.fn(async () => ({ state: 'error', data: null })),
}));

const { setLocale } = await import('../../src/i18n/index.js');
const hub = await import('../../src/ui/ferni-hub.ui.js');
const trust = await import('../../src/ui/trust-dashboard.ui.js');
const personalize = await import('../../src/ui/personalize.ui.js');

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const escape = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

function namedDialog(): HTMLElement {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
  expect(dialogs).toHaveLength(1);
  const dialog = dialogs[0] as HTMLElement;
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  const id = dialog.getAttribute('aria-labelledby') as string;
  expect(id).toBeTruthy();
  const heading = document.getElementById(id);
  expect(dialog.contains(heading)).toBe(true);
  expect(heading?.textContent?.trim()).toBeTruthy();
  return dialog;
}

beforeEach(async () => {
  await setLocale('en-US', { reload: false });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('menu panels that were not dialogs', () => {
  it('Your Day: named modal dialog, Escape closes it', async () => {
    void hub.show();
    await frame();
    const dialog = namedDialog();
    expect(dialog.classList.contains('ferni-hub-panel')).toBe(true);
    const overlay = document.querySelector('.ferni-hub-overlay') as HTMLElement;
    expect(overlay.classList.contains('visible')).toBe(true);
    escape();
    expect(overlay.classList.contains('visible')).toBe(false);
  });

  it('Trust & Growth: named modal dialog, Escape closes it once', async () => {
    void trust.showTrustDashboard();
    await frame();
    const dialog = namedDialog();
    expect(dialog.classList.contains('trust-dashboard-modal')).toBe(true);
    const overlay = document.querySelector('.trust-dashboard-overlay') as HTMLElement;
    expect(overlay.classList.contains('visible')).toBe(true);
    escape();
    expect(overlay.classList.contains('visible')).toBe(false);
  });

  it('Make It Yours: named modal dialog, Escape closes it', async () => {
    personalize.open();
    await frame();
    const dialog = namedDialog();
    expect(dialog.classList.contains('personalize-card')).toBe(true);
    expect(personalize.isModalOpen()).toBe(true);
    escape();
    expect(personalize.isModalOpen()).toBe(false);
  });
});
