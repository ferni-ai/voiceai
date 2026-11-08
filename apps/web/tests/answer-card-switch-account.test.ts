/**
 * "Switch account" on an answer card the signed-in person can't see: it must
 * sign out the way settings does (clear this browser, reload to the gate), not
 * a bare sign-out that leaves the last person's data for the next one.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: false, status: 404, data: null })),
}));
const signOutOfThisBrowser = vi.fn(async () => true);
vi.mock('../src/ui/sign-out.js', () => ({ signOutOfThisBrowser }));
const bareSignOut = vi.fn(async () => {});
vi.mock('../src/services/firebase-auth.service.js', () => ({ signOut: bareSignOut }));
vi.mock('../src/services/auth-init.service.js', () => ({ initializeAuth: vi.fn() }));
vi.mock('../src/ui/sign-in-gate.ui.js', () => ({ showSignInGate: vi.fn(async () => {}) }));

const { showAnswerCard } = await import('../src/ui/answer-card-page.ui.js');

describe('switch account from an answer card', () => {
  it('signs out through the shared sign-out that clears this browser', async () => {
    const root = document.createElement('main');
    await showAnswerCard(root, 'card-1');
    const button = root.querySelector('button');
    expect(button).not.toBeNull();
    button?.click();
    await Promise.resolve();
    expect(signOutOfThisBrowser).toHaveBeenCalledOnce();
    expect(bareSignOut).not.toHaveBeenCalled();
  });
});
