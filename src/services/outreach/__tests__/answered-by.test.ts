/**
 * Who answered a call Ferni placed is recorded where that call's result
 * lives: a voicemail on an on-behalf call is a finished result the user hears
 * about; a person answering is noted on the call; a family check-in that hit
 * voicemail is closed as 'voicemail'. Without the requesting user, nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureCallResult = vi.fn(async () => undefined);
vi.mock('../call-result-capture.js', () => ({ captureCallResult }));
const completeCallRecord = vi.fn(async () => undefined);
vi.mock('../../family/proactive-family-checkin.js', () => ({ completeCallRecord }));
const writes: Array<{ path: string; data: unknown; opts: unknown }> = [];
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: (c: string) => ({
      doc: (u: string) => ({
        collection: (c2: string) => ({
          doc: (id: string) => ({
            set: async (data: unknown, opts: unknown) =>
              void writes.push({ path: `${c}/${u}/${c2}/${id}`, data, opts }),
          }),
        }),
      }),
    }),
  }),
}));

const { recordAnsweredBy } = await import('../answered-by.js');

const call = {
  callId: 'doug-checkin',
  requesterUserId: 'seth-uid',
  kind: 'on_behalf' as const,
  recipientName: 'Doug',
  recipientPhone: '+18015550100',
  purpose: 'Check in on Doug.',
  callType: 'personal',
  userName: 'Seth',
  originalSessionId: 's0',
};

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
});

describe('recordAnsweredBy', () => {
  it('an on-behalf call that hit voicemail is captured as a voicemail result for Seth', async () => {
    await recordAnsweredBy(call, 'voicemail');
    expect(captureCallResult).toHaveBeenCalledTimes(1);
    const [callId, outcome, request] = captureCallResult.mock.calls[0] as unknown as [
      string,
      { status: string; objectiveAchieved: boolean; outcome: string },
      { userId: string; resolvedContact: { name: string }; originalSessionId: string },
    ];
    expect(callId).toBe('doug-checkin');
    expect(outcome).toMatchObject({ status: 'voicemail', objectiveAchieved: false });
    expect(outcome.outcome).toMatch(/Doug's voicemail/);
    expect(request).toMatchObject({
      userId: 'seth-uid',
      resolvedContact: { name: 'Doug' },
      originalSessionId: 's0',
    });
    expect(writes).toHaveLength(0);
  });

  it('a person answering is noted on the call, not reported as a result', async () => {
    await recordAnsweredBy(call, 'human');
    expect(writes).toEqual([
      {
        path: 'bogle_users/seth-uid/on_behalf_calls/doug-checkin',
        data: { answeredBy: 'human', answeredAt: expect.any(String) },
        opts: { merge: true },
      },
    ]);
    expect(captureCallResult).not.toHaveBeenCalled();
  });

  it('a family check-in that hit voicemail closes its call record as voicemail', async () => {
    await recordAnsweredBy({ ...call, kind: 'family_checkin' }, 'voicemail');
    expect(completeCallRecord).toHaveBeenCalledWith('seth-uid', 'doug-checkin', {
      status: 'voicemail',
    });
    expect(captureCallResult).not.toHaveBeenCalled();
  });

  it('records nothing without the requesting user', async () => {
    await recordAnsweredBy({ ...call, requesterUserId: undefined }, 'voicemail');
    expect(captureCallResult).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });
});
