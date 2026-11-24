/**
 * DURABLE_ACCESS_GRANTS (#2264): reopenLapsedApproval resets a lapsed approval to pending only
 * on a definite "not admitted", and never over an admin approval that landed after the read.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { StoredWaitlistEntry } from '../access-grant-standing.js';
import { forgetAdmissionCache, type AdmissionStore } from '../admission.js';
import { reopenLapsedApproval } from '../lapsed-approval.js';

const FLAG_ON: NodeJS.ProcessEnv = { WAITLIST_GATE: 'on', DURABLE_ACCESS_GRANTS: 'on' };
const WHO = { uid: 'uid-0102', email: 'sam.example@example.com' };
const OPEN_ACCESS: StoredWaitlistEntry = { status: 'approved', source: 'open_access', approvedVia: 'open_access' }; // prettier-ignore

/** One waitlist doc behind a transaction fake that re-reads it, as Firestore does. */
function fakeDb(doc: { data: Record<string, unknown> }) {
  const writes: Array<Record<string, unknown>> = [];
  const db = {
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: async () => ({ exists: true, data: () => ({ ...doc.data }) }),
        update: (_ref: unknown, data: Record<string, unknown>) => {
          writes.push(data);
          doc.data = { ...doc.data, ...data };
        },
      }),
  };
  return { db: db as never, ref: {} as never, writes };
}

/** The admission store: nothing admits; `during` runs while the live rules are read. */
function store(over: Partial<AdmissionStore> = {}, during = (): void => {}): AdmissionStore {
  return {
    waitlistStatus: async () => undefined,
    hasActiveSubscription: async () => false,
    accountCreatedAt: async () => null,
    inCohort: async () => false,
    waitlistEntry: async () => {
      during();
      return OPEN_ACCESS;
    },
    subscriptions: async () => [],
    accountSubscription: async () => undefined,
    ...over,
  };
}

beforeEach(() => forgetAdmissionCache());

describe('reopenLapsedApproval', () => {
  it('a lapsed open-access approval goes back to pending on a definite not-admitted', async () => {
    const doc = { data: { ...OPEN_ACCESS } as Record<string, unknown> };
    const { db, ref, writes } = fakeDb(doc);
    expect(await reopenLapsedApproval(db, ref, OPEN_ACCESS, WHO, { env: FLAG_ON, store: store() })).toBe(true); // prettier-ignore
    expect(writes).toHaveLength(1);
    expect(doc.data).toMatchObject({
      status: 'pending',
      lapsedApproval: { source: 'open_access' },
    });
  });

  it('a failed lookup (no profile, the entry read errors) writes nothing', async () => {
    const doc = { data: { ...OPEN_ACCESS } as Record<string, unknown> };
    const { db, ref, writes } = fakeDb(doc);
    const broken = store({ waitlistEntry: async () => Promise.reject(new Error('unavailable')) });
    expect(await reopenLapsedApproval(db, ref, OPEN_ACCESS, WHO, { env: FLAG_ON, store: broken })).toBe(false); // prettier-ignore
    expect(writes).toEqual([]);
    expect(doc.data).toEqual(OPEN_ACCESS);
  });

  it('an admin approval that lands between the read and the write is kept', async () => {
    const doc = { data: { ...OPEN_ACCESS } as Record<string, unknown> };
    const { db, ref, writes } = fakeDb(doc);
    const adminApproves = () => void (doc.data = { ...doc.data, approvedBy: 'admin-api', approvedVia: 'admin' }); // prettier-ignore
    const racing = store({}, adminApproves);
    expect(await reopenLapsedApproval(db, ref, OPEN_ACCESS, WHO, { env: FLAG_ON, store: racing })).toBe(false); // prettier-ignore
    expect(writes).toEqual([]);
    expect(doc.data).toMatchObject({ status: 'approved', approvedBy: 'admin-api' });
  });

  it('flag off: nothing is read or written', async () => {
    const doc = { data: { ...OPEN_ACCESS } as Record<string, unknown> };
    const { db, ref, writes } = fakeDb(doc);
    const env = { WAITLIST_GATE: 'on' } as NodeJS.ProcessEnv;
    expect(await reopenLapsedApproval(db, ref, OPEN_ACCESS, WHO, { env, store: store() })).toBe(false); // prettier-ignore
    expect(writes).toEqual([]);
  });
});
