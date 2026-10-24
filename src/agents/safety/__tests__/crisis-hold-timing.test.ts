/**
 * The crisis gate releases a held reply after noteCrisisHold. Reporting the hold to
 * the turn's receipt must never stop that release, even for a session whose
 * userData getter throws (a LiveKit session with no userData set).
 */
import { describe, expect, it, vi } from 'vitest';
import { noteCrisisVerdictPending } from '../crisis-gate-signal.js';
import { noteCrisisHold } from '../crisis-hold-timing.js';

describe('noteCrisisHold', () => {
  it('returns the hold and never throws when the session has no userData', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const session = {
      get userData(): never {
        throw new Error('Voice agent userData is not set');
      },
    };
    const verdict = new Promise<unknown>(() => {});
    noteCrisisVerdictPending(session, verdict);
    expect(() => noteCrisisHold(verdict, 9_780)).not.toThrow();
    expect(noteCrisisHold(verdict, 9_780)).toBe(220);
    expect(noteCrisisHold(verdict, 0)).toBe(0);
    vi.useRealTimers();
  });
});
