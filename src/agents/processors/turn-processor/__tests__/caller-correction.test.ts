/**
 * The turn processor's correction hook (process-turn.ts) records corrections
 * as before and, with DISPUTE_DENIED_FACTS on, disputes a denied memory for
 * the session's user. Lines from Seth's prod call, 2026-10-12.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  autoRecord: vi.fn(async () => undefined),
  dispute: vi.fn(async () => ({ kind: 'nothing' as const })),
}));

vi.mock('../../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: { autoRecord: calls.autoRecord },
}));
vi.mock('../../../../memory/recall/dispute.js', () => ({ disputeForCaller: calls.dispute }));

import { recordCallerCorrection } from '../caller-correction.js';

const PETER =
  'How did those contracts end up looking by the time you finally wrapped up last night?';

beforeEach(() => {
  calls.autoRecord.mockClear();
  calls.dispute.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('recordCallerCorrection', () => {
  it('flag on: disputes the denial for the session user, and still records the correction', async () => {
    vi.stubEnv('DISPUTE_DENIED_FACTS', 'on');
    await recordCallerCorrection('seth-uid', 'What contracts?', PETER, 'peter-john');
    expect(calls.autoRecord).toHaveBeenCalledWith(
      'seth-uid',
      'What contracts?',
      PETER,
      'peter-john'
    );
    expect(calls.dispute).toHaveBeenCalledWith('seth-uid', 'What contracts?', PETER);
  });

  it('flag off: records the correction only', async () => {
    vi.stubEnv('DISPUTE_DENIED_FACTS', 'off');
    await recordCallerCorrection('seth-uid', 'What contracts?', PETER, 'peter-john');
    expect(calls.autoRecord).toHaveBeenCalledTimes(1);
    expect(calls.dispute).not.toHaveBeenCalled();
  });
});
