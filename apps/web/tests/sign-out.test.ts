/**
 * Signing out from the settings menu.
 *
 * The web app had no sign-out at all for an approved person: the only call
 * sites were the waitlist screen and account deletion. Signing out must leave
 * a shared browser clean, and a failed sign-out must not pretend to succeed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOutReleasingPush = vi.fn();
vi.mock('../src/services/push-preference.js', () => ({ signOutReleasingPush }));
const toast = { error: vi.fn(), success: vi.fn() };
vi.mock('../src/ui/whisper.ui.js', () => ({ toast }));

const { signOutOfThisBrowser } = await import('../src/ui/sign-out.js');

// Sign-out seals storage until the reload, which never comes here: undo it after each test.
const realSetItem = Object.getOwnPropertyDescriptor(localStorage, 'setItem') as PropertyDescriptor;
afterEach(() => {
  Object.defineProperty(localStorage, 'setItem', realSetItem);
});

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

  it("a module that finishes starting up after the clear can't put the person's data back", async () => {
    // menu-e2e run 40105651631: the milestones init, on its 600 ms timer, landed between
    // the clear and the reload and saved ferni-milestones again for the next person.
    signOutReleasingPush.mockResolvedValue(undefined);
    localStorage.setItem('ferni-milestones', '{}');
    localStorage.setItem('ferni_theme', 'dark');
    expect(await signOutOfThisBrowser(vi.fn())).toBe(true);

    const { initFerniMilestones } = await import('../src/ui/ferni-milestones.ui.js');
    initFerniMilestones();
    localStorage.setItem('ferni_relationship', '{"stage":"close"}');

    expect(localStorage.getItem('ferni-milestones')).toBeNull();
    expect(localStorage.getItem('ferni_relationship')).toBeNull();
    // This device's settings and keys that aren't Ferni's still save.
    localStorage.setItem('ferni_theme', 'light');
    localStorage.setItem('unrelated-key', 'x');
    expect([localStorage.getItem('ferni_theme'), localStorage.getItem('unrelated-key')]).toEqual([
      'light',
      'x',
    ]);
  });

  it('keeps everything and says so when signing out fails', async () => {
    signOutReleasingPush.mockRejectedValue(new Error('network down'));
    const reload = vi.fn();
    expect(await signOutOfThisBrowser(reload)).toBe(false);
    expect(localStorage.getItem('ferni_relationship')).not.toBeNull();
    localStorage.setItem('ferni-milestones', '{}'); // still signed in: still saving
    expect(localStorage.getItem('ferni-milestones')).toBe('{}');
    expect(reload).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledOnce();
  });
});

describe('what sign-out and account deletion clear', () => {
  it("removes a person's data under every key prefix, keeps this device's settings", async () => {
    const { clearAllUserData, exportLocalStorage } = await import('../src/config/storage-keys.js');
    const personal = ['ferni_relationship', 'ferni:onboarding:complete', 'ferni:notification-prefs',
      'ferni-milestones', 'ferni-achievements', 'ferni-last-interaction-date', 'voiceai_selectedPersona'];
    const device = ['ferni_theme', 'ferni_locale', 'ferni-haptics-disabled'];
    for (const key of [...personal, ...device]) localStorage.setItem(key, 'x');

    expect(Object.keys(exportLocalStorage())).toEqual(expect.arrayContaining(personal)); // export is complete too
    clearAllUserData();
    expect(personal.filter((k) => localStorage.getItem(k) !== null), 'left behind').toEqual([]);
    expect(device.filter((k) => localStorage.getItem(k) === null), 'device settings lost').toEqual([]);
  });
});
