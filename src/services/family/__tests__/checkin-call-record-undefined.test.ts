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

vi.mock('../../superhuman/firestore-utils.js', () => {
  const reject = (data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data))
      if (v === undefined)
        throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${k}")`);
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
});
