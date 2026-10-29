/**
 * A failed profile read must never be taken for "no productivity data yet".
 *
 * FirestoreStore.getProfile answers null on a read error and on a real not-found
 * alike. ProductivityStore.loadUserData took that null for a new user, cached
 * empty data, and once the read recovered the next save wrote [new] over every
 * stored medication and bill. It now loads with getProfileStrict: a read error
 * caches nothing, holds back saves, and the next load (or the save itself)
 * retries the read; a profile with no productivity data still loads as empty.
 *
 * Firestore is the in-memory merge fake (reads of a path can be made to fail);
 * FirestoreStore, the profile store and ProductivityStore are real. Every
 * assertion reads the stored document.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';
import type { BillData, MedicationData, ProductivityData } from '../productivity-store.js';

const h = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('../../../memory/storage/store-factory.js', () => ({ getStore: async () => h.store }));

const { FirestoreStore } = await import('../../../memory/storage/firestore-store.js');
const { resetCallStartReads } = await import('../../../utils/call-start-reads.js');
const { default: ProductivityStore } = await import('../productivity-store.js');

const PATH = 'bogle_users/u1';
const NOW = '2026-10-01T09:00:00.000Z';

const med = (id: string, name: string): MedicationData => ({
  id,
  name,
  dosage: '10mg',
  frequency: 'daily',
  scheduledTimes: ['08:00'],
  doseLabels: ['morning'],
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
});
const bill = (id: string, name: string): BillData => ({
  id,
  name,
  payee: name,
  category: 'utilities',
  amount: 80,
  frequency: 'monthly',
  dueDay: 5,
  nextDueDate: '2026-11-05',
  reminderDaysBefore: 3,
  isAutoPay: false,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
});
const profileDoc = (productivityData?: Partial<ProductivityData>) => ({
  id: 'u1',
  name: 'fixture',
  createdAt: NOW,
  ...(productivityData && { productivityData }),
});

let state: MergeFakeState;

function stored(): { medications: string[]; bills: string[] } {
  const data = state.docs.get(PATH)?.productivityData as Partial<ProductivityData> | undefined;
  return {
    medications: (data?.medications ?? []).map((m) => m.name).sort(),
    bills: (data?.bills ?? []).map((b) => b.name).sort(),
  };
}

async function freshStore() {
  const ps = new ProductivityStore();
  await ps.initialize();
  return ps;
}

/** The tools' write path: add one medication and one bill, then flush the debounced save. */
async function addAndSave(ps: InstanceType<typeof ProductivityStore>): Promise<void> {
  ps.setMedication('u1', med('med-new', 'lisinopril'));
  ps.setBill('u1', bill('bill-new', 'water'));
  await ps.flushAll();
}

beforeEach(() => {
  vi.stubEnv('PERSIST_AGENT_PROFILES', 'true');
  resetCallStartReads();
  state = newMergeFakeState();
  state.failReads = new Set();
  const store = new FirestoreStore({ projectId: 'test-project' });
  Object.assign(store as unknown as Record<string, unknown>, {
    db: createMergeFakeFirestore(state),
    _initialized: true,
  });
  h.store = store;
  state.docs.set(
    PATH,
    profileDoc({ medications: [med('med-old', 'metformin')], bills: [bill('bill-old', 'rent')] })
  );
});

describe('ProductivityStore never saves empty defaults over a profile it failed to read', () => {
  it('(a) a read error holds back saves while the read keeps failing: nothing is written', async () => {
    const ps = await freshStore();
    state.failReads?.add(PATH);
    await ps.loadUserData('u1');
    await addAndSave(ps);

    expect(state.writes.filter((w) => w.path === PATH)).toEqual([]);
    expect(stored()).toEqual({ medications: ['metformin'], bills: ['rent'] });
  });

  it('(a) a read error, then the read recovers before the save: stored medications and bills survive', async () => {
    const ps = await freshStore();
    state.failReads?.add(PATH);
    expect((await ps.loadUserData('u1')).medications).toEqual([]);
    state.failReads?.clear();
    await addAndSave(ps);

    expect(stored()).toEqual({
      medications: ['lisinopril', 'metformin'],
      bills: ['rent', 'water'],
    });
  });

  it('(b) a profile with no productivity data yet loads as empty and the save writes', async () => {
    state.docs.set(PATH, profileDoc());
    const ps = await freshStore();
    expect((await ps.loadUserData('u1')).medications).toEqual([]);
    await addAndSave(ps);

    expect(stored()).toEqual({ medications: ['lisinopril'], bills: ['water'] });
  });

  it('(b) no profile document at all is not a read failure: the load is cached as empty', async () => {
    state.docs.delete(PATH);
    const ps = await freshStore();
    const first = await ps.loadUserData('u1');
    state.failReads?.add(PATH); // a cached load does not read again
    expect(await ps.loadUserData('u1')).toBe(first);
  });

  it('(c) a good read hydrates the stored data and the save keeps it', async () => {
    const ps = await freshStore();
    const loaded = await ps.loadUserData('u1');
    expect(loaded.medications.map((m) => m.name)).toEqual(['metformin']);
    await addAndSave(ps);

    expect(stored()).toEqual({
      medications: ['lisinopril', 'metformin'],
      bills: ['rent', 'water'],
    });
  });

  it('(d) after a failed read the next load retries, and once it succeeds saving resumes', async () => {
    const ps = await freshStore();
    state.failReads?.add(PATH);
    await ps.loadUserData('u1');
    state.failReads?.clear();

    const retried = await ps.loadUserData('u1');
    expect(retried.medications.map((m) => m.name)).toEqual(['metformin']);
    expect(retried.bills.map((b) => b.name)).toEqual(['rent']);
    await addAndSave(ps);

    expect(stored()).toEqual({
      medications: ['lisinopril', 'metformin'],
      bills: ['rent', 'water'],
    });
  });
});
