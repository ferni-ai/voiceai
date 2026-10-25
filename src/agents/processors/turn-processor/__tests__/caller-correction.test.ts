/**
 * The turn processor's correction hook (process-turn.ts) records corrections
 * as before and, with DISPUTE_DENIED_FACTS on, disputes a denied memory for
 * the session's user. Lines from Seth's prod call, 2026-10-12.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  autoRecord: vi.fn(async () => undefined),
  dispute: vi.fn(async () => ({ kind: 'nothing' as const })),
  // FRIEND_REPAIR's Firestore side; friend-repair.ts itself is real.
  repair: {
    facts: vi.fn(async () => [
      { id: 'f1', entityName: 'sister', key: 'lives_in', value: 'Denver', extractedAt: '' },
    ]),
    add: vi.fn(async (_userId: string, _record: Record<string, unknown>) => 'c1'),
    retire: vi.fn(async () => undefined),
    recent: vi.fn(async () => []),
  },
}));
vi.mock('../../../personas/friend-repair-store.js', () => ({ firestoreRepairStore: calls.repair }));

vi.mock('../../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: { autoRecord: calls.autoRecord },
}));
vi.mock('../../../../memory/recall/dispute.js', () => ({ disputeForCaller: calls.dispute }));
vi.mock('../../../../memory/storage/dispute-store.js', () => ({
  firestoreDisputeStore: { name: 'firestore' },
}));

import { recordCallerCorrection } from '../caller-correction.js';

const PETER =
  'How did those contracts end up looking by the time you finally wrapped up last night?';

beforeEach(() => {
  calls.autoRecord.mockClear();
  calls.dispute.mockClear();
  for (const fn of Object.values(calls.repair)) fn.mockClear();
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
    expect(calls.dispute).toHaveBeenCalledWith('seth-uid', 'What contracts?', PETER, {
      name: 'firestore',
    });
  });

  it('flag off: records the correction only', async () => {
    vi.stubEnv('DISPUTE_DENIED_FACTS', 'off');
    await recordCallerCorrection('seth-uid', 'What contracts?', PETER, 'peter-john');
    expect(calls.autoRecord).toHaveBeenCalledTimes(1);
    expect(calls.dispute).not.toHaveBeenCalled();
  });
});

describe('recordCallerCorrection with FRIEND_REPAIR', () => {
  const SISTER = 'So your sister in Denver is getting married, that is huge.';
  const SAID = "Ha, no, it's my brother in Denver, not my sister.";

  it('on: keeps the correction with the call it came from and retires the fact', async () => {
    vi.stubEnv('FRIEND_REPAIR', 'on');
    await recordCallerCorrection('seth-uid', SAID, SISTER, 'ferni', 'call-42');
    expect(calls.repair.add).toHaveBeenCalledTimes(1);
    const [userId, record] = calls.repair.add.mock.calls[0] ?? [];
    expect(userId).toBe('seth-uid');
    expect(record).toMatchObject({
      right: 'my brother in Denver',
      wrong: 'my sister',
      said: SAID,
      ferniSaid: SISTER,
      callId: 'call-42',
      supersededFactIds: ['f1'],
    });
    expect(calls.repair.retire).toHaveBeenCalledWith('seth-uid', ['f1'], 'c1', record.at);
    expect(calls.autoRecord).toHaveBeenCalledTimes(1);
  });

  it('on: a failed write is logged and the loose record still runs', async () => {
    vi.stubEnv('FRIEND_REPAIR', 'on');
    calls.repair.add.mockRejectedValueOnce(new Error('firestore down'));
    await recordCallerCorrection('seth-uid', SAID, SISTER, 'ferni', 'call-42');
    expect(calls.autoRecord).toHaveBeenCalledTimes(1);
    expect(calls.repair.retire).not.toHaveBeenCalled();
  });

  it('off: nothing is read or kept', async () => {
    await recordCallerCorrection('seth-uid', SAID, SISTER, 'ferni', 'call-42');
    expect(calls.repair.facts).not.toHaveBeenCalled();
    expect(calls.repair.add).not.toHaveBeenCalled();
    expect(calls.autoRecord).toHaveBeenCalledTimes(1);
  });
});
