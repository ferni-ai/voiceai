/**
 * One proactive budget per call (PROACTIVE_BUDGET), B0 conditions 1-6 and the B0 row of
 * docs/plans/2026-11-07-right-moment-program.md. Drives the production slot, the opener
 * wrappers and the real crisis-call-risk state. Mocked: nothing but two spies that pass
 * through to the real crisis checks, so a test can make one throw.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/safety/crisis-call-risk.js', async (orig) => {
  const real = await orig<typeof import('../../../services/safety/crisis-call-risk.js')>();
  return {
    ...real,
    crisisReadInFlight: vi.fn(real.crisisReadInFlight),
    crisisRiskThisCall: vi.fn(real.crisisRiskThisCall),
  };
});

import {
  crisisReadInFlight,
  crisisRiskThisCall,
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../services/safety/crisis-call-risk.js';
import {
  PROACTIVE_PER_CALL_MAX,
  SLOT_MS,
  claimOpenerFollowUp,
  claimProactiveSlot,
  clearOpenerClaims,
  peekProactiveSlot,
  proactiveSlotCount,
  releaseProactiveSlot,
  spendForSafety,
  takeOpenerClaim,
} from '../opener-claim.js';

const SAFETY = { ok: false, heldBy: 'safety' };

afterEach(() => {
  vi.unstubAllEnvs();
  clearOpenerClaims();
  resetCrisisCallRisk();
});

describe('PROACTIVE_BUDGET on: one proactive slot per call', () => {
  it('B0 row: two askers on one call, one wins; another call is unaffected', () => {
    expect(claimProactiveSlot('call-a', 'caller-card')).toEqual({ ok: true });
    expect(claimProactiveSlot('call-a', 'follow-up')).toEqual({ ok: false, heldBy: 'caller-card' });
    expect(peekProactiveSlot('call-a')).toBe('caller-card');
    expect(peekProactiveSlot('call-b')).toBeUndefined();
    expect(claimProactiveSlot('call-b', 'follow-up')).toEqual({ ok: true });
  });

  it('B0 row: a crisis spends the slot to zero for the rest of the call', () => {
    expect(claimProactiveSlot('call-a', 'caller-card')).toEqual({ ok: true });
    noteCrisisRisk('call-a');
    expect(peekProactiveSlot('call-a')).toBe('safety');
    resetCrisisCallRisk(); // the risk note goes; the spent slot stays
    expect(claimProactiveSlot('call-a', 'recall-trigger')).toEqual(SAFETY);
    expect(peekProactiveSlot('call-a')).toBe('safety');
  });

  it('condition 1: an opener claim through the old wrapper holds the same slot', () => {
    vi.stubEnv('PROACTIVE_BUDGET', 'on');
    expect(peekProactiveSlot('call-a')).toBeUndefined();
    claimOpenerFollowUp('user-a', 'greeting', 'call-a');
    expect(claimProactiveSlot('call-a', 'recall-trigger')).toEqual({
      ok: false,
      heldBy: 'greeting',
    });
    expect(takeOpenerClaim('user-a', 'call-a')).toBe('greeting');
  });

  it('condition 1: a wrapper with no sessionId holds nothing and reads nothing', () => {
    vi.stubEnv('PROACTIVE_BUDGET', 'on');
    claimOpenerFollowUp('user-a', 'greeting', 'call-a');
    claimOpenerFollowUp('user-b', 'greeting');
    expect(proactiveSlotCount()).toBe(1);
    expect(takeOpenerClaim('user-a')).toBeUndefined();
    expect(claimProactiveSlot('', 'recall-trigger')).toEqual(SAFETY);
  });

  it('condition 2: refused while a crisis read is in flight, granted after a clean read', async () => {
    let settle!: (read: { risk: string } | null) => void;
    const read = trackCrisisRead(
      'call-a',
      'how was your day',
      new Promise<{ risk: string } | null>((r) => {
        settle = r;
      })
    );
    expect(claimProactiveSlot('call-a', 'follow-up')).toEqual(SAFETY);
    settle({ risk: 'none' });
    await read;
    expect(crisisReadInFlight('call-a')).toBe(false);
    expect(claimProactiveSlot('call-a', 'follow-up')).toEqual({ ok: true });
  });

  it('condition 2: a read that finds risk spends the slot', async () => {
    const read = trackCrisisRead(
      'call-a',
      'i want to disappear',
      Promise.resolve({ risk: 'high' })
    );
    await read;
    expect(claimProactiveSlot('call-a', 'follow-up')).toEqual(SAFETY);
  });

  it('condition 3: each crisis check that throws refuses with safety', () => {
    expect(claimProactiveSlot('call-a', 'follow-up')).toEqual({ ok: true }); // precondition
    for (const check of [crisisReadInFlight, crisisRiskThisCall]) {
      clearOpenerClaims();
      vi.mocked(check).mockImplementationOnce(() => {
        throw new Error('risk store unreadable');
      });
      expect(claimProactiveSlot('call-a', 'follow-up')).toEqual(SAFETY);
      vi.mocked(check).mockImplementationOnce(() => {
        throw new Error('risk store unreadable');
      });
      expect(peekProactiveSlot('call-a')).toBe('safety');
    }
  });

  it('condition 4: one per call, and a declined opener ask counts', () => {
    vi.stubEnv('PROACTIVE_BUDGET', 'on');
    expect(PROACTIVE_PER_CALL_MAX).toBe(1);
    claimOpenerFollowUp('user-a', 'greeting', 'call-a'); // asked; the caller said "not now"
    expect(takeOpenerClaim('user-a', 'call-a')).toBe('greeting');
    expect(claimProactiveSlot('call-a', 'commitment-insight')).toEqual({
      ok: false,
      heldBy: 'greeting',
    });
  });

  it('condition 5: release is narrow, and never clears safety', () => {
    expect(claimProactiveSlot('call-a', 'recall-trigger')).toEqual({ ok: true });
    releaseProactiveSlot('call-a', 'follow-up');
    expect(peekProactiveSlot('call-a')).toBe('recall-trigger');
    spendForSafety('call-a');
    releaseProactiveSlot('call-a', 'recall-trigger');
    expect(peekProactiveSlot('call-a')).toBe('safety');
    expect(claimProactiveSlot('call-a', 'recall-trigger')).toEqual(SAFETY);
  });

  it('condition 5: the holder can give back a slot it did not use', () => {
    expect(claimProactiveSlot('call-a', 'commitment-insight')).toEqual({ ok: true });
    releaseProactiveSlot('call-a', 'commitment-insight');
    expect(peekProactiveSlot('call-a')).toBeUndefined();
    expect(proactiveSlotCount()).toBe(0);
  });

  it('condition 6: a slot whose call end never ran lapses', () => {
    const t0 = Date.now();
    claimProactiveSlot('call-a', 'follow-up', t0);
    expect(proactiveSlotCount()).toBe(1);
    claimProactiveSlot('call-b', 'follow-up', t0 + SLOT_MS + 1);
    expect(proactiveSlotCount()).toBe(1);
    expect(peekProactiveSlot('call-a')).toBeUndefined();
  });
});

describe('PROACTIVE_BUDGET off: the opener wrappers as on main', () => {
  it('keys by userId, takes once, and touches no slot', () => {
    claimOpenerFollowUp('user-a', 'greeting', 'call-a', 1000);
    expect(proactiveSlotCount()).toBe(0);
    expect(takeOpenerClaim('user-b', 'call-a', 1000)).toBeUndefined();
    expect(takeOpenerClaim('user-a', undefined, 2000)).toBe('greeting');
    expect(takeOpenerClaim('user-a', 'call-a', 3000)).toBeUndefined();
  });
});
