/**
 * Signing out from the settings menu.
 *
 * The web app had no sign-out at all for an approved person: the only call
 * sites were the waitlist screen and account deletion. Signing out must leave
 * a shared browser clean, and a failed sign-out must not pretend to succeed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOutReleasingPush = vi.fn();
vi.mock('../src/services/push-preference.js', () => ({ signOutReleasingPush }));
const toast = { error: vi.fn(), success: vi.fn() };
vi.mock('../src/ui/whisper.ui.js', () => ({ toast }));

const { signOutOfThisBrowser } = await import('../src/services/sign-out.js');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('ferni_relationship', '{"stage":"building-trust"}');
});

describe('signOutOfThisBrowser', () => {
  it('signs out, clears what the app kept here, and reloads to the sign-in screen', async () => {
    signOutReleasingPush.mockResolvedValue(undefined);
    const reload = vi.fn();
    expect(await signOutOfThisBrowser(reload)).toBe(true);
    expect(signOutReleasingPush).toHaveBeenCalledOnce();
    expect(localStorage.getItem('ferni_relationship')).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps everything and says so when signing out fails', async () => {
    signOutReleasingPush.mockRejectedValue(new Error('network down'));
    const reload = vi.fn();
    expect(await signOutOfThisBrowser(reload)).toBe(false);
    expect(localStorage.getItem('ferni_relationship')).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledOnce();
  });
});
