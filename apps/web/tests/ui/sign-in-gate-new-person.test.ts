/**
 * What a new person meets on the sign-in gate (new-person hunt, 2026-10-18):
 * - "Continue with Apple" failed for everyone on the web, so it stays hidden
 *   until VITE_APPLE_WEB_SIGNIN is on.
 * - A failed popup says why (blocked, provider off, network, closed) instead of
 *   "cancelled or failed", and never shows the library's raw message.
 * - Terms and Privacy pointed at the app host, which serves the app for every
 *   path; they now open the real pages on ferni.ai.
 * - After sign-in the gate says "Getting things ready", not "Checking your access".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n/index.js';
import {
  APPLE_WEB_SIGNIN_STORAGE_KEY,
  isAppleWebSignInEnabled,
} from '../../src/config/apple-web-signin-flag.js';
import { signInFailureReason } from '../../src/services/sign-in-error.js';

type AuthListener = (state: { isAuthenticated: boolean }) => void;
const authListeners: AuthListener[] = [];
const signInWithGoogle = vi.fn<() => Promise<unknown>>();
const signInWithApple = vi.fn<() => Promise<unknown>>();
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  onAuthStateChange: vi.fn((cb: AuthListener) => {
    authListeners.push(cb);
    return () => undefined;
  }),
  signInWithApple: () => signInWithApple(),
  signInWithGoogle: () => signInWithGoogle(),
}));
vi.mock('../../src/services/push-preference.js', () => ({ signOutReleasingPush: vi.fn() }));
vi.mock('../../src/services/access-check.js', () => ({
  checkAccess: vi.fn(() => new Promise(() => undefined)), // stays "checking"
}));

async function openGate(): Promise<HTMLElement> {
  const { showSignInGate } = await import('../../src/ui/sign-in-gate.ui.js');
  void showSignInGate();
  await Promise.resolve();
  return document.querySelector<HTMLElement>('.sign-in-gate-content')!;
}

const providers = (gate: HTMLElement): string[] =>
  [...gate.querySelectorAll<HTMLElement>('.sign-in-gate-btn')].map((b) => b.dataset.provider ?? '');

function firebaseError(code: string): Error {
  // Firebase messages are English and can carry addresses; the gate must not show them.
  return Object.assign(new Error(`Firebase: Error (${code}). person@example.com`), { code });
}

async function failSignIn(
  gate: HTMLElement,
  provider: 'google' | 'apple',
  error: unknown
): Promise<string> {
  (provider === 'google' ? signInWithGoogle : signInWithApple).mockRejectedValueOnce(error);
  gate.querySelector<HTMLButtonElement>(`[data-provider="${provider}"]`)!.click();
  await vi.waitFor(() => expect(gate.querySelector('.sign-in-gate-error.visible')).not.toBeNull());
  return gate.querySelector('.sign-in-gate-error')!.textContent ?? '';
}

beforeEach(() => {
  authListeners.length = 0;
  signInWithGoogle.mockReset();
  signInWithApple.mockReset();
});

afterEach(async () => {
  const { hideSignInGate } = await import('../../src/ui/sign-in-gate.ui.js');
  vi.useFakeTimers();
  hideSignInGate();
  vi.runAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('Apple sign-in on the web', () => {
  it('is off by default', () => {
    expect(isAppleWebSignInEnabled()).toBe(false);
  });

  it('hides "Continue with Apple" while the flag is off', async () => {
    const gate = await openGate();
    expect(providers(gate)).toEqual(['google']);
    expect(gate.querySelector('.sign-in-gate-btn--apple')).toBeNull();
    expect(gate.textContent).not.toContain(t('auth.continueWithApple'));
  });

  it('shows "Continue with Apple" when the build turns it on', async () => {
    vi.stubEnv('VITE_APPLE_WEB_SIGNIN', 'true');
    const gate = await openGate();
    expect(providers(gate)).toEqual(['google', 'apple']);
    expect(gate.querySelector('[data-provider="apple"]')?.textContent).toBe(
      t('auth.continueWithApple')
    );
  });

  it('one browser can turn it on, or force it off on a build that has it on', async () => {
    localStorage.setItem(APPLE_WEB_SIGNIN_STORAGE_KEY, 'true');
    expect(isAppleWebSignInEnabled()).toBe(true);
    vi.stubEnv('VITE_APPLE_WEB_SIGNIN', 'true');
    localStorage.setItem(APPLE_WEB_SIGNIN_STORAGE_KEY, 'false');
    expect(isAppleWebSignInEnabled()).toBe(false);
  });

  it('a click on the shown Apple button signs in with Apple', async () => {
    localStorage.setItem(APPLE_WEB_SIGNIN_STORAGE_KEY, 'true');
    const gate = await openGate();
    signInWithApple.mockResolvedValueOnce({});
    gate.querySelector<HTMLButtonElement>('[data-provider="apple"]')!.click();
    expect(signInWithApple).toHaveBeenCalledOnce();
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });
});

describe('a failed sign-in says why', () => {
  it.each([
    ['auth/popup-blocked', 'popup-blocked'],
    ['auth/operation-not-allowed', 'provider-unavailable'],
    ['auth/unauthorized-domain', 'provider-unavailable'],
    ['auth/network-request-failed', 'network'],
    ['auth/popup-closed-by-user', 'closed'],
    ['auth/cancelled-popup-request', 'closed'],
    ['auth/internal-error', 'unknown'],
  ] as const)('%s is %s', (code, reason) => {
    expect(signInFailureReason(firebaseError(code))).toBe(reason);
  });

  it('treats errors without a Firebase code as unknown', () => {
    expect(signInFailureReason(new Error('Firebase Auth not configured'))).toBe('unknown');
    expect(signInFailureReason(null)).toBe('unknown');
  });

  it('shows a different message for each reason on the gate, never the raw error', async () => {
    const gate = await openGate();
    const seen = new Map<string, string>();
    for (const code of [
      'auth/popup-blocked',
      'auth/operation-not-allowed',
      'auth/network-request-failed',
      'auth/popup-closed-by-user',
      'auth/internal-error',
    ]) {
      const message = await failSignIn(gate, 'google', firebaseError(code));
      expect(message).not.toMatch(/auth\/|Firebase|@/);
      seen.set(code, message);
      gate.querySelector('.sign-in-gate-error')!.classList.remove('visible');
    }
    expect(new Set(seen.values()).size).toBe(5);
    expect(seen.get('auth/popup-blocked')).toBe(t('auth.signInPopupBlocked'));
    expect(seen.get('auth/operation-not-allowed')).toBe(
      t('auth.signInProviderUnavailable', { provider: 'Google' })
    );
    expect(seen.get('auth/network-request-failed')).toBe(t('auth.signInNetwork'));
    expect(seen.get('auth/popup-closed-by-user')).toBe(t('auth.signInClosed'));
    expect(seen.get('auth/internal-error')).toBe(t('auth.signInError'));
  });

  it('names Apple when Apple is the provider that is off', async () => {
    localStorage.setItem(APPLE_WEB_SIGNIN_STORAGE_KEY, 'true');
    const gate = await openGate();
    const message = await failSignIn(gate, 'apple', firebaseError('auth/operation-not-allowed'));
    expect(message).toBe(t('auth.signInProviderUnavailable', { provider: 'Apple' }));
    expect(message).toContain('Apple');
  });
});

describe('Terms and Privacy on the gate', () => {
  it('open the real pages on ferni.ai in a new tab', async () => {
    const gate = await openGate();
    const links = [...gate.querySelectorAll<HTMLAnchorElement>('.sign-in-gate-footer a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://ferni.ai/terms',
      'https://ferni.ai/privacy',
    ]);
    for (const a of links) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
    }
  });
});

describe('after sign-in', () => {
  it('says "Getting things ready", not that access is being checked', async () => {
    const gate = await openGate();
    for (const listener of authListeners) listener({ isAuthenticated: true });
    const subtitle = gate.querySelector('.sign-in-gate-subtitle')?.textContent ?? '';
    expect(subtitle).toBe(t('auth.checkingAccess'));
    expect(subtitle).toMatch(/^Getting things ready/);
    expect(subtitle).not.toMatch(/access/i);
  });
});
