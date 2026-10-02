/**
 * Memory domain registry: every memory-control operation reaches registered
 * domains (important dates and the ones still to come), and one failing
 * domain never stops the others.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from './fake-firestore.js';
import { FakeVectorStore } from './fake-vector-store.js';
import { base, seedUser, UID } from './seed.js';

const h = vi.hoisted(() => ({
  db: null as unknown,
  vectors: null as unknown,
  dates: {
    exportImportantDates: vi.fn(),
    deleteImportantDatesFor: vi.fn(),
    deleteAllImportantDates: vi.fn(),
    findImportantDates: vi.fn(),
    deleteImportantDate: vi.fn(),
  },
}));

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => h.db }));
vi.mock('../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => h.vectors,
}));
vi.mock('../../important-dates/index.js', () => h.dates);
vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return { getFiles: async () => [[]], deleteFiles: async () => undefined };
    }
  },
}));

import {
  deleteAllMemories,
  deleteConversation,
  deleteUserAccountData,
  exportMemories,
  getMemoryDomains,
  handleVoiceForget,
  registerMemoryDomain,
  resetMemoryDomains,
  resetVoiceForgetState,
} from '../index.js';
import { VOICE_COPY } from '../voice-forget.js';

let db: FakeFirestore;

beforeEach(() => {
  db = new FakeFirestore();
  h.db = db;
  h.vectors = new FakeVectorStore();
  seedUser(db, h.vectors as FakeVectorStore, UID);
  resetMemoryDomains({ loadBuiltIns: false });
  resetVoiceForgetState();
  vi.clearAllMocks();
});

function fakeDomain(name: string, fail = false) {
  const calls: string[] = [];
  const maybeFail = (): void => {
    if (fail) throw new Error(`${name} is down`);
  };
  registerMemoryDomain({
    name,
    exportFn: async (uid) => {
      maybeFail();
      return [{ owner: uid, name }];
    },
    deleteForConversation: async (uid, convId) => {
      maybeFail();
      calls.push(`conv:${uid}:${convId}`);
      return 1;
    },
    deleteAll: async (uid) => {
      maybeFail();
      calls.push(`all:${uid}`);
      return 2;
    },
  });
  return calls;
}

describe('registry hooks', () => {
  it('cascades a conversation delete into every domain for each conversation id', async () => {
    const goals = fakeDomain('goals');
    const result = await deleteConversation(UID, 'c1');
    expect(result.ok && result.value.deleted.domains).toEqual({ goals: 2 });
    expect(goals).toEqual([`conv:${UID}:c1`, `conv:${UID}:sess-1`]);
  });

  it('isolates a failing domain', async () => {
    const goals = fakeDomain('goals');
    fakeDomain('habits', true);
    const result = await deleteAllMemories(UID);
    expect(result.ok && result.value.domains).toEqual({ goals: 2, habits: 'failed' });
    expect(goals).toEqual([`all:${UID}`]);
  });

  it('account deletion runs every domain and is incomplete when one fails', async () => {
    fakeDomain('goals');
    const ok = await deleteUserAccountData(UID);
    expect(ok.domains).toEqual({ goals: 2 });
    expect(ok.complete).toBe(true);

    fakeDomain('habits', true);
    const partial = await deleteUserAccountData('user-z');
    expect(partial.domains.habits).toBe('failed');
    expect(partial.complete).toBe(false);
  });

  it('includes domain data in the JSON and CSV exports', async () => {
    fakeDomain('goals');
    const json = await exportMemories(UID, 'json');
    expect(json.ok && JSON.parse(json.value.body).domains).toEqual({
      goals: [{ owner: UID, name: 'goals' }],
    });
    const csv = await exportMemories(UID, 'csv');
    expect(csv.ok && csv.value.body).toContain('# goals');
  });
});

describe('important dates (built-in domain)', () => {
  beforeEach(() => {
    resetMemoryDomains();
    h.dates.exportImportantDates.mockResolvedValue({
      success: true,
      data: [{ id: 'date_1', title: "Sam's birthday" }],
    });
    h.dates.deleteImportantDatesFor.mockResolvedValue({
      success: true,
      data: { updated: 1, deleted: 1 },
    });
    h.dates.deleteAllImportantDates.mockResolvedValue({ success: true, data: { deleted: 3 } });
    h.dates.findImportantDates.mockResolvedValue({
      success: true,
      data: [{ id: 'date_1', title: "Sam's birthday" }],
    });
    h.dates.deleteImportantDate.mockResolvedValue({ success: true, data: { deleted: true } });
  });

  it('registers itself', async () => {
    expect((await getMemoryDomains()).map((d) => d.name)).toContain('importantDates');
  });

  it('is cascaded, wiped and exported', async () => {
    const conv = await deleteConversation(UID, 'c1');
    expect(conv.ok && conv.value.deleted.domains?.importantDates).toBe(4);
    expect(h.dates.deleteImportantDatesFor).toHaveBeenCalledWith(UID, 'c1');

    const all = await deleteAllMemories(UID);
    expect(all.ok && all.value.domains.importantDates).toBe(3);

    const json = await exportMemories(UID, 'json');
    expect(json.ok && JSON.parse(json.value.body).domains.importantDates).toHaveLength(1);
  });

  it('reports a failed store as failed, not as zero', async () => {
    h.dates.deleteAllImportantDates.mockResolvedValue({
      success: false,
      error: { message: 'down' },
    });
    const report = await deleteUserAccountData(UID);
    expect(report.domains.importantDates).toBe('failed');
    expect(report.complete).toBe(false);
  });

  it('voice forget can forget a date', async () => {
    const ask = await handleVoiceForget(UID, { query: "Sam's birthday" });
    expect(ask).toBe('I found the date "Sam\'s birthday". Want me to forget it?');
    expect(await handleVoiceForget(UID, { confirm: true })).toBe(VOICE_COPY.doneFinal);
    expect(h.dates.deleteImportantDate).toHaveBeenCalledWith(UID, 'date_1', 'voice_forget');
    expect(db.get(`${base()}/dynamic_entities/p1`)).toBeDefined();
  });
});
