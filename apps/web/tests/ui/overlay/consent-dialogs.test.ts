/**
 * Consent and voice enrollment on the dialog primitive (overlay plan PR h).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/api.js', () => ({ apiPost: vi.fn(() => Promise.resolve({ ok: true, status: 200 })) }));
vi.mock('@/services/connection.service.js', () => ({
  connectionService: { sendData: vi.fn(() => Promise.resolve(true)), isConnected: () => false },
}));
const cancelEnrollment = vi.fn(() => Promise.resolve());
vi.mock('@/services/voice-auth.service.js', () => ({
  getVoiceAuthService: () => ({
    getStatus: () => Promise.resolve({ available: true, features: { enrollment: true } }),
    getProfile: () => Promise.resolve({ enrolled: false }),
    cancelEnrollment,
  }),
}));

import {
  cleanupActionConfirmations,
  dismissActionConfirmation,
  showActionConfirmation,
  type PendingAction,
} from '@/ui/action-confirmation.ui.js';
import { resetDialogScrollLock } from '@/ui/overlay/dialog.js';
import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';
import { hideVoiceEnrollmentModal, showVoiceEnrollmentModal } from '@/ui/voice-enrollment.ui.js';

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
});

describe('voice enrollment', () => {
  it('keeps its own overlay when the flag is off', async () => {
    await showVoiceEnrollmentModal();
    expect(document.querySelector('.voice-enrollment-modal')).not.toBeNull();
    expect(dialogs()).toHaveLength(0);
    hideVoiceEnrollmentModal();
  });

  it('opens in a dialog that Escape closes, cancelling the enrollment, when the flag is on', async () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const onCancel = vi.fn();
    await showVoiceEnrollmentModal({ onCancel });
    const [d] = dialogs();
    expect(d?.getAttribute('aria-labelledby')).toBe('voice-enrollment-title');
    expect(d?.querySelector('#voice-enrollment-content')?.textContent?.trim()).not.toBe('');
    expect(document.getElementById('voice-enrollment-styles')).not.toBeNull();

    escape(d);
    expect(onCancel).toHaveBeenCalled();
    expect(cancelEnrollment).toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(dialogs()).toHaveLength(0);
  });
});
