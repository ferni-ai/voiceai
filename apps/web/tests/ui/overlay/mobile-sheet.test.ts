/**
 * Mobile bottom sheet on the dialog sheet (overlay plan PR g).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  close,
  disposeMobileBottomSheet,
  initMobileBottomSheet,
  open,
} from '@/ui/mobile-bottom-sheet.ui.js';
import { resetDialogScrollLock } from '@/ui/overlay/dialog.js';
import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';

function phone(): void {
  window.matchMedia = ((query: string) => ({
    matches: query === '(max-width: 768px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const sheetDialog = () => document.querySelector('dialog.mobile-bottom-sheet-dialog');
const trigger = () => document.querySelector('.mobile-menu-trigger');

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  phone();
  resetDialogScrollLock();
  initMobileBottomSheet();
});

afterEach(() => {
  disposeMobileBottomSheet();
  localStorage.clear();
  vi.useRealTimers();
});

describe('mobile bottom sheet', () => {
  it('keeps its own sheet when the flag is off', () => {
    open();
    expect(document.querySelector('.mobile-bottom-sheet.open')).not.toBeNull();
    expect(sheetDialog()).toBeNull();
    close();
  });

  it('opens its actions in a dialog sheet when the flag is on', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    open();
    const d = sheetDialog();
    expect(d?.classList.contains('ferni-dialog--sheet')).toBe(true);
    expect(d?.getAttribute('aria-labelledby')).toBe('mobile-sheet-title');
    expect(d?.querySelectorAll('.mobile-bottom-sheet__action').length).toBeGreaterThan(3);
    expect(document.querySelector('.mobile-bottom-sheet.open')).toBeNull();
    expect(trigger()?.getAttribute('aria-expanded')).toBe('true');
  });

  it('gives the content back to the sheet when Escape closes the dialog, and can reopen', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    open();
    sheetDialog()?.dispatchEvent(new Event('cancel', { cancelable: true }));
    vi.runAllTimers();
    expect(sheetDialog()).toBeNull();
    expect(document.querySelector('.mobile-bottom-sheet .mobile-bottom-sheet__content')).not.toBeNull();
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false');

    open();
    expect(sheetDialog()?.querySelectorAll('.mobile-bottom-sheet__action').length).toBeGreaterThan(3);
  });

  it('closes when an action runs', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    open();
    (sheetDialog()?.querySelector('[data-action="settings"]') as HTMLElement | null)?.click();
    vi.runAllTimers();
    expect(sheetDialog()).toBeNull();
  });
});
