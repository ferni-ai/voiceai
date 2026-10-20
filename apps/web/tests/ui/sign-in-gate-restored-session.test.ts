/**
 * A remembered sign-in is checked too. app.ts used to run the access check
 * only for people signed out at load, so someone on the waitlist got in by
 * reloading. Now the restored session goes through the same check, without
 * holding up app start.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessOutcome } from '../../src/services/access-check.js';

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  // Already signed in: the gate's subscription fires at once, like the real service
  onAuthStateChange: vi.fn((cb: (s: { isAuthenticated: boolean }) => void) => {
    cb({ isAuthenticated: true });
    return () => undefined;
  }),
  signInWithApple: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock('../../src/services/push-preference.js', () => ({ signOutReleasingPush: vi.fn() }));
const serverAnswer = vi.hoisted(() => ({ outcome: { kind: 'approved' } as AccessOutcome }));
vi.mock('../../src/services/access-check.js', () => ({
  checkAccess: vi.fn(async () => serverAnswer.outcome),
}));

const { isSignInGateShowing, hideSignInGate } = await import('../../src/ui/sign-in-gate.ui.js');
const { requireAccessForRestoredSession } = await import('../../src/ui/restored-session-access.js');

afterEach(() => {
  vi.useFakeTimers(); // the gate finishes hiding after its fade
  hideSignInGate();
  vi.runAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const restore = (outcome: AccessOutcome) => {
  serverAnswer.outcome = outcome;
  void requireAccessForRestoredSession(async () => outcome);
  return new Promise((r) => setTimeout(r, 0));
};

describe('restored session', () => {
  it('approved: no gate', async () => {
    await restore({ kind: 'approved' });
    expect(isSignInGateShowing()).toBe(false);
  });

  it('still on the waitlist: the gate comes up and says so', async () => {
    await restore({ kind: 'waitlisted', email: 'pat@example.test' });
    expect(isSignInGateShowing()).toBe(true);
    expect(document.querySelector('.sign-in-gate-waitlist')).not.toBeNull();
  });

  it('the check itself failed: the app opens (the server still refuses a voice session)', async () => {
    await restore({ kind: 'unavailable' });
    expect(isSignInGateShowing()).toBe(false);
  });

  it('app.ts runs the check on the already-signed-in branch', () => {
    const app = readFileSync(resolve(__dirname, '../../src/app.ts'), 'utf8');
    const branch = app.slice(app.indexOf("log.info('User already authenticated'"), app.indexOf('visualStorytellingService.init')); // prettier-ignore
    expect(branch).toContain('requireAccessForRestoredSession()');
  });
});
