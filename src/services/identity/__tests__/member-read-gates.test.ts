/**
 * Gates that read a member's stored data, or act as if the caller were the
 * member, refuse every non-member id. Before isMemberIdentity these checked
 * `!== 'anonymous'` (or kept their own list), so an unrecognised caller
 * (anon:) or the third party on a call Ferni places (onbehalf:) passed. Each
 * gate also runs a member id, so a gate that refused everyone fails too.
 */
import { describe, expect, it, vi } from 'vitest';
import { isIdentifiedUser } from '../../../conversation/humanization/voice-pattern-session.js';
import { isFirstCall } from '../../../agents/personas/first-call-rapport.js';
import { envForCaller, type CohortStore } from '../../platform/cohort-flags.js';

const NON_MEMBERS = ['anonymous', 'anon:3b0e7c1e-0000-4000-8000-000000000000', 'onbehalf:call-1'];
const MEMBER = 'uid-member-1';

function spyStore(): CohortStore & { cohortsFor: ReturnType<typeof vi.fn> } {
  return {
    cohortsFor: vi.fn(async () => [{ id: 'f', enabled: true, flags: { DATES_THAT_MATTER: 'on' } }]),
    overridesFor: vi.fn(async () => ({})),
  } as CohortStore & { cohortsFor: ReturnType<typeof vi.fn> };
}

describe('member gates on reads and acts', () => {
  const env = { COHORT_FLAGS: 'on', DATES_THAT_MATTER: 'off' };

  it.each(NON_MEMBERS)("after-call work never reads %s's cohort flags", async (userId) => {
    const store = spyStore();
    expect((await envForCaller(userId, { store, env })).DATES_THAT_MATTER).toBe('off');
    expect(store.cohortsFor).not.toHaveBeenCalled();
  });

  it("after-call work reads a member's cohort flags", async () => {
    const store = spyStore();
    expect((await envForCaller(MEMBER, { store, env })).DATES_THAT_MATTER).toBe('on');
  });

  it.each(NON_MEMBERS)('first-call rapport is not for %s', (userId) => {
    expect(isFirstCall({ userId, isReturningUser: false })).toBe(false);
  });

  it("first-call rapport is for a member's first call", () => {
    expect(isFirstCall({ userId: MEMBER, isReturningUser: false })).toBe(true);
  });

  it.each([...NON_MEMBERS, 'shared', 'device:0f1e2d3c'])(
    'voice patterns are never loaded or saved under %s',
    (userId) => {
      expect(isIdentifiedUser(userId)).toBe(false);
    }
  );

  it('voice patterns load and save for an identified member', () => {
    expect(isIdentifiedUser(MEMBER)).toBe(true);
    expect(isIdentifiedUser('phone:+15555550100')).toBe(true);
  });
});
