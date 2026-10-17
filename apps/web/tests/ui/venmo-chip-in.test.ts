/**
 * Venmo chip-in tests.
 *
 * - Paywall on, flag off or no handle: openSupport opens the Stripe Support Ferni modal.
 * - Paywall off, flag off or no handle: openSupport opens nothing (Ferni is free).
 * - Flag on with a handle: the Venmo card opens, paywall or not (a voluntary chip-in).
 * - Flag on with a handle: the Venmo card opens with a $1 pay link, the handle as
 *   text, an optional QR, Escape to close, and a copy that falls back to selection.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupportOpen = vi.fn(() => Promise.resolve());

vi.mock('../../src/ui/support-ferni.ui.js', () => ({
  supportFerniUI: { open: mockSupportOpen },
}));

const HANDLE = 'ferni-test';
const LOCALES_DIR = resolve(__dirname, '../../src/i18n/locales');
const CARD_SRC = resolve(__dirname, '../../src/ui/support/venmo-chip-in.ui.ts');

function enable(handle: string | undefined = HANDLE): void {
  vi.stubEnv('VITE_VENMO_CHIP_IN', 'true');
  vi.stubEnv('VITE_VENMO_HANDLE', handle ?? '');
}

function card(): HTMLDialogElement | null {
  return document.querySelector('dialog.venmo-chip-in');
}

async function openCard(): Promise<HTMLDialogElement> {
  enable();
  const { openSupport } = await import('../../src/ui/support/open-support.js');
  await openSupport();
  const dialog = card();
  if (!dialog) throw new Error('Venmo card did not open');
  return dialog;
}

describe('openSupport routing', () => {
  beforeEach(async () => {
    mockSupportOpen.mockClear();
    document.body.innerHTML = '';
    const { recordPaywallFlag } = await import('../../src/services/paywall.service.js');
    recordPaywallFlag({ paywall: true }); // Stripe Support Ferni exists only with a paywall
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    const { resetPaywallFlagForTests } = await import('../../src/services/paywall.service.js');
    resetPaywallFlagForTests();
  });

  it('with the paywall off and the flag off, opens nothing at all', async () => {
    const { resetPaywallFlagForTests } = await import('../../src/services/paywall.service.js');
    resetPaywallFlagForTests();
    vi.stubEnv('VITE_VENMO_CHIP_IN', 'false');
    vi.stubEnv('VITE_VENMO_HANDLE', HANDLE);
    const { openSupport, canOpenSupport } = await import('../../src/ui/support/open-support.js');
    expect(canOpenSupport()).toBe(false);
    await openSupport();
    expect(mockSupportOpen).not.toHaveBeenCalled();
    expect(card()).toBeNull();
  });

  it('with the paywall off and the flag on, still opens the voluntary Venmo card', async () => {
    const { resetPaywallFlagForTests } = await import('../../src/services/paywall.service.js');
    resetPaywallFlagForTests();
    const dialog = await openCard();
    expect(dialog).not.toBeNull();
    expect(mockSupportOpen).not.toHaveBeenCalled();
  });

  it('opens the Stripe Support Ferni modal when the flag is off', async () => {
    vi.stubEnv('VITE_VENMO_CHIP_IN', 'false');
    vi.stubEnv('VITE_VENMO_HANDLE', HANDLE);
    const { openSupport } = await import('../../src/ui/support/open-support.js');
    await openSupport();
    expect(mockSupportOpen).toHaveBeenCalledTimes(1);
    expect(card()).toBeNull();
  });

  it('opens the Stripe Support Ferni modal when the flag is on but no handle is set', async () => {
    enable('');
    const { openSupport } = await import('../../src/ui/support/open-support.js');
    await openSupport();
    expect(mockSupportOpen).toHaveBeenCalledTimes(1);
    expect(card()).toBeNull();
  });

  it('treats a malformed handle as unset and opens Stripe', async () => {
    enable('../evil?x=1');
    const { openSupport } = await import('../../src/ui/support/open-support.js');
    await openSupport();
    expect(mockSupportOpen).toHaveBeenCalledTimes(1);
    expect(card()).toBeNull();
  });

  it('accepts a handle written with a leading @', async () => {
    enable(`@${HANDLE}`);
    const { openSupport } = await import('../../src/ui/support/open-support.js');
    await openSupport();
    expect(card()?.querySelector('.vci-handle')?.textContent).toBe(`@${HANDLE}`);
  });

  it('opens the Venmo card, not Stripe, when the flag and handle are set', async () => {
    const dialog = await openCard();
    expect(mockSupportOpen).not.toHaveBeenCalled();
    expect(dialog.open || dialog.hasAttribute('open')).toBe(true);
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
    expect(title?.textContent).toBe('A dollar keeps the conversation going');
  });
});

describe('Venmo chip-in card', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('links to Venmo with a $1 amount and an encoded note', async () => {
    const dialog = await openCard();
    const link = dialog.querySelector<HTMLAnchorElement>('a.vci-open');
    expect(link?.getAttribute('href')).toBe(
      `https://venmo.com/${HANDLE}?txn=pay&amount=1&note=Ferni`
    );
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener');
    expect(link?.textContent).toBe('Open Venmo');
  });

  it('shows the handle as text', async () => {
    const dialog = await openCard();
    expect(dialog.querySelector('.vci-handle')?.textContent).toBe(`@${HANDLE}`);
  });

  it('removes the QR block when the image is missing', async () => {
    const dialog = await openCard();
    const img = dialog.querySelector('figure img');
    expect(img?.getAttribute('alt')).toBe(`Venmo QR code for @${HANDLE}`);
    img?.dispatchEvent(new Event('error'));
    expect(dialog.querySelector('figure')).toBeNull();
    expect(dialog.querySelector('.vci-handle')).not.toBeNull();
    expect(dialog.querySelector('a.vci-open')).not.toBeNull();
  });

  it('shows the QR block once the image loads', async () => {
    const dialog = await openCard();
    const figure = dialog.querySelector('figure');
    expect(figure?.hidden).toBe(true);
    figure?.querySelector('img')?.dispatchEvent(new Event('load'));
    expect(figure?.hidden).toBe(false);
  });

  it('closes on Escape', async () => {
    const dialog = await openCard();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(card()).toBeNull();
  });

  it('closes on Maybe later and puts focus on it first', async () => {
    const dialog = await openCard();
    const later = dialog.querySelector<HTMLButtonElement>('.vci-later');
    expect(document.activeElement).toBe(later);
    later?.click();
    expect(card()).toBeNull();
  });

  it('says Copied inline when the clipboard accepts', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const dialog = await openCard();
    dialog.querySelector<HTMLButtonElement>('.vci-copy')?.click();
    await vi.waitFor(() => expect(dialog.querySelector('.vci-status')?.textContent).toBe('Copied'));
    expect(writeText).toHaveBeenCalledWith(`@${HANDLE}`);
  });

  it('selects the handle when the clipboard rejects', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
    });
    window.getSelection()?.removeAllRanges();
    const dialog = await openCard();
    dialog.querySelector<HTMLButtonElement>('.vci-copy')?.click();
    await vi.waitFor(() => expect(window.getSelection()?.toString()).toBe(`@${HANDLE}`));
    expect(dialog.querySelector('.vci-status')?.textContent).toBe('');
  });

  it('renders no emoji', async () => {
    const dialog = await openCard();
    const attrs = Array.from(dialog.querySelectorAll('*')).flatMap((node) =>
      Array.from(node.attributes).map((a) => a.value)
    );
    const rendered = [dialog.textContent ?? '', ...attrs].join(' ');
    expect(rendered.length).toBeGreaterThan(100);
    expect(rendered).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('venmoChipIn translations', () => {
  const locales = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
  const read = (file: string): Record<string, unknown> =>
    JSON.parse(readFileSync(resolve(LOCALES_DIR, file), 'utf8')) as Record<string, unknown>;
  const usedKeys = [...readFileSync(CARD_SRC, 'utf8').matchAll(/t\('venmoChipIn\.(\w+)'/g)].map(
    (m) => m[1]
  );

  it('the card uses translated strings', () => {
    expect(usedKeys.length).toBeGreaterThanOrEqual(10);
    expect(locales).toHaveLength(11);
  });

  it.each(locales)('%s has every venmoChipIn key the card uses', (file) => {
    const section = read(file).venmoChipIn as Record<string, unknown> | undefined;
    for (const key of usedKeys) {
      const value = section?.[key];
      expect(
        typeof value === 'string' && value.trim().length > 0,
        `${file} venmoChipIn.${key}`
      ).toBe(true);
    }
    expect((section?.qrAlt as string).includes('{handle}'), `${file} qrAlt keeps {handle}`).toBe(
      true
    );
  });
});
