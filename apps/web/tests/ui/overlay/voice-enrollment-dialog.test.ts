/**
 * Voice enrollment on the dialog primitive (overlay plan PR h, part 2).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const cancelEnrollment = vi.fn(() => Promise.resolve());
vi.mock('@/services/voice-auth.service.js', () => ({
  getVoiceAuthService: () => ({
    getStatus: () => Promise.resolve({ available: true, features: { enrollment: true } }),
    getProfile: () => Promise.resolve({ enrolled: false }),
    cancelEnrollment,
  }),
}));

import { resetDialogScrollLock } from '@/ui/overlay/dialog.js';
import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';
import { hideVoiceEnrollmentModal, showVoiceEnrollmentModal } from '@/ui/voice-enrollment.ui.js';

const dialogs = () => [...document.querySelectorAll('dialog.ferni-dialog')] as HTMLDialogElement[];
const escape = (d: Element | undefined) => d?.dispatchEvent(new Event('cancel', { cancelable: true }));

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  resetDialogScrollLock();
  cancelEnrollment.mockClear();
});

afterEach(() => {
  hideVoiceEnrollmentModal();
  localStorage.clear();
  vi.useRealTimers();
});

describe('voice enrollment', () => {
  it('keeps its own overlay when the flag is off', async () => {
    await showVoiceEnrollmentModal();
    expect(document.querySelector('.voice-enrollment-modal')).not.toBeNull();
    expect(dialogs()).toHaveLength(0);
  });

  it('opens in a dialog that Escape closes, cancelling the enrollment once, when the flag is on', async () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const onCancel = vi.fn();
    await showVoiceEnrollmentModal({ onCancel });
    const [d] = dialogs();
    expect(d?.getAttribute('aria-labelledby')).toBe('voice-enrollment-title');
    expect(d?.querySelector('#voice-enrollment-content')?.textContent?.trim()).not.toBe('');
    expect(document.getElementById('voice-enrollment-styles')).not.toBeNull();
    expect(document.querySelector('.voice-enrollment-modal')).toBeNull();

    escape(d);
    vi.advanceTimersByTime(500);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(cancelEnrollment).toHaveBeenCalledTimes(1);
    expect(dialogs()).toHaveLength(0);
  });

  it('closes the dialog from its close button, cancelling once', async () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const onCancel = vi.fn();
    await showVoiceEnrollmentModal({ onCancel });
    dialogs()[0]?.querySelector<HTMLElement>('.voice-enrollment-close')?.click();
    vi.advanceTimersByTime(500);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(cancelEnrollment).toHaveBeenCalledTimes(1);
    expect(dialogs()).toHaveLength(0);
  });
});
