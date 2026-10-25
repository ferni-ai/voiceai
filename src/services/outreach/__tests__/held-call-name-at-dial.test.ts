/**
 * A held call speaks the requester's name as their profile has it when it is
 * dialed, not as it was when the call was asked for. Phone-calls audit row 9
 * (prod 2026-10-24): STT saved "Fern" as the name, the held call froze it, the
 * profile was fixed before 9 AM, and the call still said "Fern".
 *
 * The real executeDueDeferredCalls over a fake deferred_calls collection; the
 * orchestrator and the profile store are faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
const initiateCall = vi.fn(async (_r: { userName: string }) => 'call_1');
vi.mock('../on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({ initiateCall }),
}));
const getProfile = vi.hoisted(() =>
  vi.fn(async (): Promise<{ preferredName?: string; name?: string } | null> => null)
);
vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile }),
}));

const { executeDueDeferredCalls } = await import('../deferred-calls.js');

const NOW = new Date('2026-10-24T15:00:30.000Z');
const heldFromFern = (): Row => ({
  id: 'held-1',
  userId: 'u1',
  collection: 'deferred_calls',
  data: {
    kind: 'on_behalf',
    request: { contactQuery: 'my mom', purpose: 'say hi', userName: 'Fern' },
    status: 'pending',
    scheduledFor: new Date(NOW.getTime() - 30_000).toISOString(),
  },
});
const spokenName = () => initiateCall.mock.calls[0]?.[0].userName;

beforeEach(() => {
  rows = [heldFromFern()];
  vi.clearAllMocks();
});

describe('the requester name on a held call', () => {
  it('stored "Fern", profile now "Seth": the dialed call says Seth', async () => {
    getProfile.mockResolvedValue({ preferredName: 'Seth', name: 'Seth' });
    expect(rows[0].data.request).toMatchObject({ userName: 'Fern' });
    await executeDueDeferredCalls({ now: NOW });
    expect(getProfile).toHaveBeenCalledWith('u1');
    expect(initiateCall).toHaveBeenCalledTimes(1);
    expect(spokenName()).toBe('Seth');
  });

  it('no preferred name: the profile name', async () => {
    getProfile.mockResolvedValue({ name: 'Sam' });
    await executeDueDeferredCalls({ now: NOW });
    expect(spokenName()).toBe('Sam');
  });

  it('the profile read fails: the stored name, and the call still goes', async () => {
    getProfile.mockRejectedValue(new Error('firestore unavailable'));
    await executeDueDeferredCalls({ now: NOW });
    expect(initiateCall).toHaveBeenCalledTimes(1);
    expect(spokenName()).toBe('Fern');
  });

  it('no profile found: the stored name', async () => {
    getProfile.mockResolvedValue(null);
    await executeDueDeferredCalls({ now: NOW });
    expect(spokenName()).toBe('Fern');
  });
});
