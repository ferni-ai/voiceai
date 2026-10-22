/**
 * Check-in call records never carry undefined fields. The Firestore client the
 * family module uses (utils/firestore-utils) is built without
 * ignoreUndefinedProperties, so a record with `twilioCallSid: undefined` threw
 * before the phone rang: every SIP check-in failed at "Create a call record"
 * (seen on the 2026-10-18 dev test call). The fake below rejects undefined the
 * same way the real client does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../superhuman/firestore-utils.js')>();
  // Like the real client: undefined is rejected at any depth, arrays included
  const reject = (data: unknown, path = ''): void => {
    if (data === undefined)
      throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${path}")`);
    if (data !== null && typeof data === 'object')
      for (const [k, v] of Object.entries(data)) reject(v, path ? `${path}.${k}` : k);
  };
  const ref = (path: string[]) => ({
    collection: (name: string) => ({ doc: (id: string) => ref([...path, name, id]) }),
    set: async (data: Record<string, unknown>) => {
      reject(data);
      docs.set(path.join('/'), data);
    },
    update: async (data: Record<string, unknown>) => {
      reject(data);
      docs.set(path.join('/'), { ...docs.get(path.join('/')), ...data });
    },
    get: async () => ({ exists: docs.has(path.join('/')), data: () => docs.get(path.join('/')) }),
  });
  return {
    cleanForFirestore: actual.cleanForFirestore,
    getFirestoreDb: () => ({
      collection: (name: string) => ({ doc: (id: string) => ref([name, id]) }),
    }),
  };
});

const { createCallRecord, completeCallRecord } = await import('../proactive-family-checkin.js');

const schedule = {
  id: 'sched-1',
  sponsorUserId: 'seth-uid',
  sponsoredIdentityId: 'doug-id',
  familyMemberName: 'Doug',
} as never;

describe('check-in call records', () => {
  afterEach(() => docs.clear());

  it('are created on the SIP path, which has no Twilio call sid', async () => {
    const record = await createCallRecord(schedule);
    const saved = docs.get(`bogle_users/seth-uid/family_checkin_calls/${record.id}`);
    expect(saved).toMatchObject({ scheduleId: 'sched-1', status: 'in_progress' });
    expect(saved).not.toHaveProperty('twilioCallSid');
  });

  it('keep the Twilio call sid when there is one', async () => {
    const record = await createCallRecord(schedule, 'CA123');
    expect(docs.get(`bogle_users/seth-uid/family_checkin_calls/${record.id}`)).toMatchObject({
      twilioCallSid: 'CA123',
    });
  });

  it('complete with only the fields that have values', async () => {
    const record = await createCallRecord(schedule);
    await completeCallRecord('seth-uid', record.id, { status: 'failed', errorMessage: undefined });
    const saved = docs.get(`bogle_users/seth-uid/family_checkin_calls/${record.id}`);
    expect(saved).toMatchObject({ status: 'failed' });
    expect(saved).not.toHaveProperty('errorMessage');
  });

  it('complete when the call analysis leaves optional fields out', async () => {
    const record = await createCallRecord(schedule);
    await completeCallRecord('seth-uid', record.id, {
      status: 'completed',
      concernsIdentified: [
        { description: 'Knee hurts', urgency: 'low', category: 'health', quote: undefined },
      ],
      followUpItems: [
        { item: 'Ask about the knee', suggestedFollowUp: undefined, responsibleParty: 'ferni' },
      ],
    } as never);
    const saved = docs.get(`bogle_users/seth-uid/family_checkin_calls/${record.id}`);
    expect(saved).toMatchObject({ status: 'completed' });
    expect((saved?.concernsIdentified as object[])[0]).not.toHaveProperty('quote');
    expect((saved?.followUpItems as object[])[0]).not.toHaveProperty('suggestedFollowUp');
  });
});
