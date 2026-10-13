/**
 * Consent on the dialog primitive (overlay plan PR h).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/api.js', () => ({ apiPost: vi.fn(() => Promise.resolve({ ok: true, status: 200 })) }));
vi.mock('@/services/connection.service.js', () => ({
  connectionService: { sendData: vi.fn(() => Promise.resolve(true)), isConnected: () => false, getRoom: () => null },
}));

import {
  cleanupActionConfirmations,
  dismissActionConfirmation,
  setActionConfirmationCallbacks,
  showActionConfirmation,
  type PendingAction,
} from '@/ui/action-confirmation.ui.js';
import { apiPost } from '@/utils/api.js';
import { resetDialogScrollLock } from '@/ui/overlay/dialog.js';
import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';

function action(id: string, title: string): PendingAction {
  return {
    id,
    actionType: 'send_email',
    category: 'email',
    description: title,
    preview: { title, summary: 'Confirming the 9am run.', details: ['To: sam@example.com'], canUndo: false },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    metadata: {},
  };
}

const dialogs = () => [...document.querySelectorAll('dialog.ferni-dialog')] as HTMLDialogElement[];
const escape = (d: Element | undefined) => d?.dispatchEvent(new Event('cancel', { cancelable: true }));

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  resetDialogScrollLock();
});

afterEach(() => {
  cleanupActionConfirmations();
  localStorage.clear();
  vi.useRealTimers();
});

describe('action confirmation', () => {
  it('keeps its bottom-right card when the flag is off', () => {
    showActionConfirmation(action('a1', 'Email Sam'));
    expect(document.querySelector('.action-confirmation-container .action-card')).not.toBeNull();
    expect(dialogs()).toHaveLength(0);
  });

  it('asks in an alert dialog, focused on "Not now", when the flag is on', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    showActionConfirmation(action('a1', 'Email Sam'));
    const [d] = dialogs();
    expect(d?.getAttribute('role')).toBe('alertdialog');
    expect(d?.getAttribute('aria-labelledby')).toBe('action-title-a1');
    expect(d?.querySelector('.action-card')?.getAttribute('role')).toBeNull();
    expect(document.activeElement?.getAttribute('data-action')).toBe('reject');
    expect(document.querySelector('.action-confirmation-container')).toBeNull();
  });

  it('asks one at a time: the next waits until the first is dismissed', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    showActionConfirmation(action('a1', 'Email Sam'));
    showActionConfirmation(action('a2', 'Text Maya'));
    expect(dialogs()).toHaveLength(1);

    escape(dialogs()[0]);
    vi.advanceTimersByTime(500);
    expect(dialogs().map((d) => d.getAttribute('aria-labelledby'))).toEqual(['action-title-a2']);
  });

  it('closes when the action is dismissed by id or expires', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    showActionConfirmation(action('a1', 'Email Sam'));
    dismissActionConfirmation('a1');
    vi.advanceTimersByTime(500);
    expect(dialogs()).toHaveLength(0);

    showActionConfirmation({ ...action('a2', 'Text Maya'), expiresAt: new Date(Date.now() + 3000).toISOString() });
    vi.advanceTimersByTime(4000);
    vi.advanceTimersByTime(500);
    expect(dialogs()).toHaveLength(0);
  });

  it('treats Escape as dismissing, not rejecting, and "Not now" as a rejection', async () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const onReject = vi.fn();
    setActionConfirmationCallbacks({ onReject });
    vi.mocked(apiPost).mockClear();

    showActionConfirmation(action('a1', 'Email Sam'));
    escape(dialogs()[0]);
    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();
    expect(dialogs()).toHaveLength(0);
    expect(onReject).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();

    // Control: the reject button in the same dialog does reject.
    showActionConfirmation(action('a2', 'Text Maya'));
    dialogs()[0]?.querySelector<HTMLElement>('[data-action="reject"]')?.click();
    await vi.runAllTimersAsync();
    expect(onReject).toHaveBeenCalledWith('a2');
    setActionConfirmationCallbacks({});
  });
});
