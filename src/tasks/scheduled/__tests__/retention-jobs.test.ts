/**
 * Retention policy: transcript cleanup is OFF by default; when an operator
 * opts in it matches both Timestamp and ISO dates and targets `summaries`.
 * Memory decay only writes recall weights and never deletes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from '../../../services/memory-control/__tests__/fake-firestore.js';

const h = vi.hoisted(() => ({
  db: null as unknown,
  removedVectors: [] as string[],
}));

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => h.db }));
vi.mock('../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({
    removeDocument: async (id: string) => {
      h.removedVectors.push(id);
      return true;
    },
  }),
}));
vi.mock('../../../memory/index.js', () => ({
  checkMemoryHealthAlerts: vi.fn(),
  collectMemoryMetrics: vi.fn(),
  getFirestoreStore: () => ({ getProfile: async () => null }),
  getMemoryConsolidator: vi.fn(),
  getMemoryDeduplicator: vi.fn(),
  getMemoryDecayManager: () => ({
    // Halve every strength: enough to see weights written
    updateDecay: (memories: Array<{ strength: number }>) =>
      memories.map((m) => ({ ...m, strength: m.strength / 2 })),
    pruneWeakMemories: vi.fn(),
  }),
}));
vi.mock('../../../memory/lsh-deduplication.js', () => ({ findDuplicatesLSH: vi.fn(() => []) }));
vi.mock('../../../memory/rust-accelerator.js', () => ({
  findDuplicatesLsh: vi.fn(() => []),
  isRustAvailable: vi.fn(() => false),
  getRustInfo: vi.fn(() => ({ threads: 1 })),
}));

import { MemoryDecayJob, TranscriptCleanupJob } from '../memory-jobs.js';
import { readRetentionDays } from '../transcript-cleanup-job.js';

const ENV = [
  'TRANSCRIPT_RETENTION_DAYS',
  'SUMMARY_RETENTION_DAYS',
  'GROUP_TRANSCRIPT_RETENTION_DAYS',
];
const OLD = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
const RECENT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

let db: FakeFirestore;

beforeEach(() => {
  db = new FakeFirestore();
  h.db = db;
  h.removedVectors = [];
  for (const name of ENV) delete process.env[name];
  const u = 'bogle_users/u1';
  db.seed(u, { lastContact: RECENT.toISOString() });
  db.seed(`${u}/conversations/old-ts`, { startedAt: OLD });
  db.seed(`${u}/conversations/old-ts/turns/t1`, { role: 'user', text: 'hi' });
  db.seed(`${u}/conversations/old-iso`, { startedAt: OLD.toISOString() });
  db.seed(`${u}/conversations/new`, { startedAt: RECENT });
  db.seed(`${u}/summaries/s-old`, { timestamp: OLD });
  db.seed(`${u}/summaries/s-new`, { timestamp: RECENT });
  db.seed('somewhere_else/x/conversations/not-a-user', { startedAt: OLD });
  db.seed(`${u}/dynamic_facts/f1`, {
    text: 'Likes jazz',
    confidence: 0.8,
    extractedAt: OLD.toISOString(),
  });
  db.seed(`${u}/dynamic_entities/e1`, { name: 'Sarah', type: 'person', importance: 0.6 });
});

afterEach(() => {
  for (const name of ENV) delete process.env[name];
});

describe('readRetentionDays', () => {
  it('is null (keep forever) unless a positive integer is set', () => {
    expect(readRetentionDays('TRANSCRIPT_RETENTION_DAYS')).toBeNull();
    for (const bad of ['', '0', '-3', 'abc', '1.5']) {
      process.env.TRANSCRIPT_RETENTION_DAYS = bad;
      expect(readRetentionDays('TRANSCRIPT_RETENTION_DAYS')).toBeNull();
    }
    process.env.TRANSCRIPT_RETENTION_DAYS = '30';
    expect(readRetentionDays('TRANSCRIPT_RETENTION_DAYS')).toBe(30);
  });
});

describe('TranscriptCleanupJob', () => {
  it('deletes nothing by default', async () => {
    const result = await new TranscriptCleanupJob().run({ dryRun: false });
    expect(result.retentionDisabled).toBe(true);
    expect(db.writes).toEqual([]);
    expect(db.get('bogle_users/u1/conversations/old-ts')).toBeDefined();
  });

  it('when opted in, deletes old transcripts stored as Timestamps or ISO strings', async () => {
    process.env.TRANSCRIPT_RETENTION_DAYS = '90';
    const result = await new TranscriptCleanupJob().run({ dryRun: false });
    expect(result.transcriptsDeleted).toBe(2);
    expect(db.get('bogle_users/u1/conversations/old-ts')).toBeUndefined();
    expect(db.get('bogle_users/u1/conversations/old-ts/turns/t1')).toBeUndefined();
    expect(db.get('bogle_users/u1/conversations/old-iso')).toBeUndefined();
    expect(db.get('bogle_users/u1/conversations/new')).toBeDefined();
    expect(db.get('somewhere_else/x/conversations/not-a-user')).toBeDefined();
    // summaries are a separate opt-in
    expect(db.get('bogle_users/u1/summaries/s-old')).toBeDefined();
    expect(result.usersProcessed).toBe(1);
  });

  it('summary retention targets the `summaries` collection and its embeddings', async () => {
    process.env.SUMMARY_RETENTION_DAYS = '365';
    const result = await new TranscriptCleanupJob().run({ dryRun: false });
    expect(result.summariesDeleted).toBe(1);
    expect(db.get('bogle_users/u1/summaries/s-old')).toBeUndefined();
    expect(db.get('bogle_users/u1/summaries/s-new')).toBeDefined();
    expect(h.removedVectors).toEqual(['conversation_s-old']);
    expect(db.get('bogle_users/u1/conversations/old-ts')).toBeDefined();
  });

  it('dry run deletes nothing', async () => {
    const result = await new TranscriptCleanupJob().run({
      dryRun: true,
      transcriptRetentionDays: 1,
    });
    expect(result.transcriptsDeleted).toBe(0);
    expect(db.get('bogle_users/u1/conversations/old-ts')).toBeDefined();
  });
});

describe('MemoryDecayJob', () => {
  it('writes recall weights and never deletes a memory', async () => {
    const result = await new MemoryDecayJob().run({ dryRun: false });
    expect(result.memoriesPruned).toBe(0);
    expect(result.weightsWritten).toBe(2);
    expect(db.get('bogle_users/u1/dynamic_facts/f1')).toMatchObject({
      text: 'Likes jazz',
      recallWeight: 0.4,
    });
    expect(db.get('bogle_users/u1/dynamic_entities/e1')).toMatchObject({
      name: 'Sarah',
      recallWeight: 0.3,
    });
    expect(db.writes.filter((w) => w.startsWith('delete'))).toEqual([]);
  });

  it('dry run writes nothing', async () => {
    const result = await new MemoryDecayJob().run({ dryRun: true });
    expect(result.weightsWritten).toBe(0);
    expect(db.get('bogle_users/u1/dynamic_facts/f1')?.recallWeight).toBeUndefined();
  });
});
