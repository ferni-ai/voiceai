/**
 * An account deletion's sign-in: off before any data goes, deleted last, back on only when
 * the erasure failed and this deletion is the one that switched it off. A sign-in that can't
 * be switched off never stops the erasure: it's logged with a reason and a count, no ids.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  lookup: vi.fn(),
  setDisabled: vi.fn(),
  deleteUser: vi.fn(),
  logError: vi.fn(),
}));
vi.mock('../firebase-auth.js', () => ({
  getFirebaseUserOrThrow: auth.lookup,
  setFirebaseUserDisabled: auth.setDisabled,
  deleteFirebaseUser: auth.deleteUser,
}));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ error: auth.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { deleteSignInAfterErasure, eraseWithSignInOff } from '../erasure-sign-in.js';

const UID = 'Hn5Rc9Wd2Kt7Lp1Xv4Mb8Qs6Fz3J';
const ERASED = { profile: true, engagement: true };

beforeEach(() => {
  vi.clearAllMocks();
  auth.lookup.mockResolvedValue({ uid: UID, disabled: false });
  auth.setDisabled.mockResolvedValue('done');
  auth.deleteUser.mockResolvedValue(true);
});

describe('eraseWithSignInOff', () => {
  it('switches the sign-in off before the erasure runs, and leaves it off', async () => {
    const order: string[] = [];
    auth.setDisabled.mockImplementation(async (_uid: string, off: boolean) => {
      order.push(off ? 'off' : 'on');
      return 'done';
    });

    const results = await eraseWithSignInOff(UID, async () => (order.push('erase'), ERASED));

    expect(results).toEqual(ERASED);
    expect(order).toEqual(['off', 'erase']);
    expect(auth.setDisabled).toHaveBeenCalledWith(UID, true);
  });

  it('erases anyway when the sign-in cannot be switched off, and logs a counted reason', async () => {
    auth.setDisabled.mockResolvedValue('failed');
    const erase = vi.fn(async () => ERASED);

    expect(await eraseWithSignInOff(UID, erase)).toEqual(ERASED);
    await eraseWithSignInOff(UID, erase);

    expect(erase).toHaveBeenCalledTimes(2);
    const lines = auth.logError.mock.calls.map(([fields]) => fields);
    expect(lines).toEqual([
      { event: 'ERASURE_SIGN_IN', reason: 'disable_failed', count: expect.any(Number) },
      { event: 'ERASURE_SIGN_IN', reason: 'disable_failed', count: expect.any(Number) },
    ]);
    expect(lines[1].count).toBe(lines[0].count + 1);
    expect(JSON.stringify(auth.logError.mock.calls)).not.toContain(UID);
  });

  it('switches it back on when the erasure throws, then throws', async () => {
    await expect(
      eraseWithSignInOff(UID, async () => {
        throw new Error('User record not fully erased');
      })
    ).rejects.toThrow('User record not fully erased');

    expect(auth.setDisabled.mock.calls).toEqual([
      [UID, true],
      [UID, false],
    ]);
  });

  it('switches it back on when a step reports data left behind', async () => {
    await expect(
      eraseWithSignInOff(UID, async () => ({ profile: true, answer_cards: false }))
    ).rejects.toThrow('Data left behind: answer_cards');

    expect(auth.setDisabled).toHaveBeenLastCalledWith(UID, false);
  });

  it('never switches on a sign-in that was already off', async () => {
    auth.lookup.mockResolvedValue({ uid: UID, disabled: true });

    await expect(
      eraseWithSignInOff(UID, async () => {
        throw new Error('failed');
      })
    ).rejects.toThrow();

    expect(auth.setDisabled).not.toHaveBeenCalled();
  });

  it('switches it off when the lookup fails, and never back on', async () => {
    auth.lookup.mockRejectedValue(new Error('deadline'));

    await expect(
      eraseWithSignInOff(UID, async () => {
        throw new Error('failed');
      })
    ).rejects.toThrow('failed');

    expect(auth.setDisabled.mock.calls).toEqual([[UID, true]]);
  });

  it('does nothing to the sign-in when Firebase has no such user', async () => {
    auth.lookup.mockResolvedValue(null);

    expect(await eraseWithSignInOff(UID, async () => ERASED)).toEqual(ERASED);

    expect(auth.setDisabled).not.toHaveBeenCalled();
  });
});

describe('deleteSignInAfterErasure', () => {
  it('deletes the user, and switches nothing when that worked', async () => {
    expect(await deleteSignInAfterErasure(UID)).toBe(true);
    expect(auth.setDisabled).not.toHaveBeenCalled();
  });

  it('switches the sign-in off when the delete fails, so the account stays not live', async () => {
    auth.deleteUser.mockResolvedValue(false);

    expect(await deleteSignInAfterErasure(UID)).toBe(false);

    expect(auth.setDisabled).toHaveBeenCalledWith(UID, true);
  });

  it('switches it off when the delete throws, then throws', async () => {
    auth.deleteUser.mockRejectedValue(new Error('auth/internal-error'));

    await expect(deleteSignInAfterErasure(UID)).rejects.toThrow('auth/internal-error');

    expect(auth.setDisabled).toHaveBeenCalledWith(UID, true);
  });

  it('logs a counted reason when neither works', async () => {
    auth.deleteUser.mockResolvedValue(false);
    auth.setDisabled.mockResolvedValue('failed');

    await deleteSignInAfterErasure(UID);

    expect(auth.logError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ERASURE_SIGN_IN', reason: 'final_disable_failed' }),
      expect.any(String)
    );
  });
});
