/**
 * Dialog primitive (overlay plan PR f) and its first users: confirm() and the
 * breathing guide, behind the overlay-host flag.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));
const guideStop = vi.fn();
vi.mock('@/ui/breathing-guide.ui.js', () => ({
  createBreathingGuide: () => ({ start: vi.fn(), stop: guideStop }),
}));

import { closeBreathingGuideModal, openBreathingGuideModal } from '@/ui/breathing-guide-modal.ui.js';
import { confirm } from '@/ui/confirm-modal.ui.js';
import { openDialog, resetDialogScrollLock } from '@/ui/overlay/dialog.js';
import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';

function phone(on: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: on && query === '(max-width: 768px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const dialogs = () => [...document.querySelectorAll('dialog.ferni-dialog')] as HTMLDialogElement[];
const escape = (d: Element | undefined) => d?.dispatchEvent(new Event('cancel', { cancelable: true }));
const locked = () => document.documentElement.classList.contains('ferni-scroll-locked');

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  phone(false);
  resetDialogScrollLock();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('openDialog', () => {
  it('opens a native dialog, locks scroll, and on close unlocks it and returns focus', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const handle = openDialog(document.createElement('p'), { size: 'sm', label: 'Test', onClose });

    expect(dialogs()).toHaveLength(1);
    expect(handle.element.hasAttribute('open')).toBe(true);
    expect(handle.element.classList.contains('ferni-dialog--center')).toBe(true);
    expect(locked()).toBe(true);

    handle.close();
    expect(onClose).toHaveBeenCalledWith('api');
    vi.runAllTimers();
    expect(dialogs()).toHaveLength(0);
    expect(locked()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape and on the backdrop, but not when it must be answered', () => {
    const onClose = vi.fn();
    const a = openDialog(document.createElement('p'), { onClose });
    escape(a.element);
    expect(onClose).toHaveBeenLastCalledWith('escape');

    const b = openDialog(document.createElement('p'), { onClose });
    b.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenLastCalledWith('backdrop');

    const stuck = vi.fn();
    const c = openDialog(document.createElement('p'), { dismissible: false, onClose: stuck });
    escape(c.element);
    c.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(stuck).not.toHaveBeenCalled();
  });

  it('keeps the page locked until the last of two dialogs closes', () => {
    const a = openDialog(document.createElement('p'));
    const b = openDialog(document.createElement('p'));
    a.close();
    vi.runAllTimers();
    expect(locked()).toBe(true);
    b.close();
    vi.runAllTimers();
    expect(locked()).toBe(false);
  });

  it('is a bottom sheet with a grabber on phones, except for small alerts', () => {
    phone(true);
    const sheet = openDialog(document.createElement('p'), { size: 'md' });
    expect(sheet.element.classList.contains('ferni-dialog--sheet')).toBe(true);
    expect(sheet.element.dataset.detent).toBe('medium');
    expect(sheet.element.querySelector('.ferni-dialog__grabber')).not.toBeNull();

    const alert = openDialog(document.createElement('p'), { size: 'sm' });
    expect(alert.element.classList.contains('ferni-dialog--center')).toBe(true);
  });
});

describe('confirm()', () => {
  it('keeps its own overlay when the flag is off', () => {
    void confirm({ title: 'Delete agent?', message: 'This cannot be undone.' });
    expect(document.querySelector('.confirm-modal-overlay')).not.toBeNull();
    expect(dialogs()).toHaveLength(0);
  });

  it('is a native alert dialog with focus on Cancel when the flag is on', async () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const answer = confirm({ title: 'Forget <b>this</b>?', message: 'Gone for good.', destructive: true });
    const [d] = dialogs();
    expect(d?.getAttribute('role')).toBe('alertdialog');
    expect(d?.querySelector('.ferni-dialog__title')?.textContent).toBe('Forget <b>this</b>?');
    const [cancel, ok] = [...(d?.querySelectorAll('button') ?? [])];
    expect(cancel?.autofocus).toBe(true);
    expect(ok?.classList.contains('ferni-dialog__button--destructive')).toBe(true);

    ok?.click();
    await expect(answer).resolves.toBe(true);
  });

  it('answers false on Escape, and a second confirm keeps the first one answerable', async () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const first = confirm({ title: 'One', message: 'First' });
    const second = confirm({ title: 'Two', message: 'Second' });
    expect(dialogs()).toHaveLength(2);
    escape(dialogs()[1]);
    escape(dialogs()[0]);
    await expect(second).resolves.toBe(false);
    await expect(first).resolves.toBe(false);
  });
});

describe('breathing guide', () => {
  it('opens in a dialog that Escape closes, stopping the guide, when the flag is on', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    openBreathingGuideModal({ technique: 'box' });
    expect(document.querySelector('.ferni-breathing-modal')).toBeNull();
    const [d] = dialogs();
    expect(d?.getAttribute('aria-labelledby')).toBe('ferni-breathing-modal-title');

    escape(d);
    expect(guideStop).toHaveBeenCalled();
    vi.runAllTimers();
    expect(dialogs()).toHaveLength(0);
  });

  it('keeps its own overlay when the flag is off', () => {
    openBreathingGuideModal({ technique: 'box' });
    expect(document.querySelector('.ferni-breathing-modal')).not.toBeNull();
    closeBreathingGuideModal();
    expect(dialogs()).toHaveLength(0);
  });
});
