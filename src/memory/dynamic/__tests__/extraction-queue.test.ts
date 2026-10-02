import { beforeEach, describe, expect, it } from 'vitest';
import {
  FirestoreExtractionQueue,
  InMemoryExtractionQueue,
  backoffMs,
  queueDocId,
  type QueueableJob,
} from '../extraction-queue.js';
import { FakeFirestore } from './helpers/fake-firestore.js';

interface TestJob extends QueueableJob {
  transcript: string;
}

const job = (
  id: string,
  priority: QueueableJob['priority'] = 'normal',
  userId = 'u1'
): TestJob => ({
  jobId: id,
  userId,
  priority,
  timestamp: new Date('2026-10-01T10:00:00Z'),
  transcript: `text ${id}`,
});

let db: FakeFirestore;
let clock: number;
const now = () => clock;
const jobsPath = (uid: string) => `bogle_users/${uid}/extraction_jobs`;

beforeEach(() => {
  db = new FakeFirestore();
  clock = Date.parse('2026-10-02T00:00:00Z');
});

describe('backoffMs', () => {
  it('grows exponentially and is capped', () => {
    const fixed = () => 1; // top of the jitter range
    expect(backoffMs(1, 1000, 60_000, fixed)).toBe(1000);
    expect(backoffMs(2, 1000, 60_000, fixed)).toBe(2000);
    expect(backoffMs(4, 1000, 60_000, fixed)).toBe(8000);
    expect(backoffMs(20, 1000, 60_000, fixed)).toBe(60_000);
    expect(backoffMs(3, 1000, 60_000, () => 0)).toBe(2000); // bottom: half the ceiling
  });
});

describe('FirestoreExtractionQueue', () => {
  it('stores jobs under the user and leases them in priority order', async () => {
    const q = new FirestoreExtractionQueue<TestJob>(db, { now });
    await q.enqueue(job('a', 'low'));
    await q.enqueue(job('b', 'normal'));
    await q.enqueue(job('c', 'high', 'u2'));
    expect(
      db
        .list(jobsPath('u1'))
        .map((d) => d.id)
        .sort()
    ).toEqual(['a', 'b']);
    expect(db.get(`${jobsPath('u2')}/c`)?.status).toBe('pending');

    const leased = await q.claim(10);
    expect(leased.map((l) => l.id)).toEqual(['c', 'b', 'a']);
    expect(leased[0].job.timestamp).toBeInstanceOf(Date);
    expect(leased[0].job.transcript).toBe('text c');
    expect(db.get(`${jobsPath('u1')}/b`)).toMatchObject({ status: 'leased', attempts: 1 });
  });

  it('never leases the same job twice while the lease holds', async () => {
    const q1 = new FirestoreExtractionQueue<TestJob>(db, { now });
    const q2 = new FirestoreExtractionQueue<TestJob>(db, { now });
    await q1.enqueue(job('a'));
    expect(await q1.claim(5)).toHaveLength(1);
    expect(await q2.claim(5)).toHaveLength(0);
  });

  it('deletes completed jobs', async () => {
    const q = new FirestoreExtractionQueue<TestJob>(db, { now });
    await q.enqueue(job('a'));
    const [leased] = await q.claim(1);
    await q.complete(leased);
    expect(db.list(jobsPath('u1'))).toHaveLength(0);
  });

  it('retries failures after a backoff, then dead-letters them', async () => {
    const q = new FirestoreExtractionQueue<TestJob>(db, {
      now,
      maxAttempts: 3,
      baseBackoffMs: 1000,
    });
    await q.enqueue(job('a'));

    for (let attempt = 1; attempt <= 2; attempt++) {
      const [leased] = await q.claim(1);
      expect(leased.attempts).toBe(attempt);
      expect(await q.fail(leased, `boom ${attempt}`)).toBe('retry');
      expect(db.get(`${jobsPath('u1')}/a`)).toMatchObject({
        status: 'pending',
        lastError: `boom ${attempt}`,
      });
      // Not claimable until the backoff has elapsed.
      expect(await q.claim(1)).toHaveLength(0);
      clock += 60_000;
    }

    const [last] = await q.claim(1);
    expect(await q.fail(last, 'still broken')).toBe('dead');
    const dead = db.get(`${jobsPath('u1')}/a`);
    expect(dead).toMatchObject({ status: 'dead', lastError: 'still broken', attempts: 3 });
    expect(dead?.expireAt).toBeInstanceOf(Date);
    clock += 24 * 3600_000;
    expect(await q.claim(1)).toHaveLength(0);
  });

  it('reclaims jobs whose lease expired (worker died mid-job)', async () => {
    const dying = new FirestoreExtractionQueue<TestJob>(db, { now, leaseMs: 30_000 });
    await dying.enqueue(job('a'));
    await dying.claim(1);

    const fresh = new FirestoreExtractionQueue<TestJob>(db, { now, leaseMs: 30_000 });
    expect(await fresh.claim(1)).toHaveLength(0);
    clock += 31_000;
    const [reclaimed] = await fresh.claim(1);
    expect(reclaimed.id).toBe('a');
    expect(reclaimed.attempts).toBe(2);
  });

  it('dead-letters a job whose lease keeps expiring', async () => {
    const q = new FirestoreExtractionQueue<TestJob>(db, { now, leaseMs: 1000, maxAttempts: 2 });
    await q.enqueue(job('poison'));
    await q.claim(1);
    clock += 2000;
    await q.claim(1);
    clock += 2000;
    expect(await q.claim(1)).toHaveLength(0);
    expect(db.get(`${jobsPath('u1')}/poison`)?.status).toBe('dead');
  });

  it('makes job ids safe for Firestore paths', () => {
    expect(queueDocId('deep-u/1-s-2')).toBe('deep-u_1-s-2');
  });
});

describe('InMemoryExtractionQueue', () => {
  it('leases, retries with backoff and dead-letters like the durable queue', async () => {
    const q = new InMemoryExtractionQueue<TestJob>({ now, maxAttempts: 2, baseBackoffMs: 1000 });
    await q.enqueue(job('a'));
    await q.enqueue(job('h', 'high'));
    const first = await q.claim(5);
    expect(first.map((l) => l.id)).toEqual(['h', 'a']);
    await q.complete(first[0]);
    expect(await q.fail(first[1], 'x')).toBe('retry');
    expect(await q.claim(5)).toHaveLength(0);
    clock += 10_000;
    const [again] = await q.claim(5);
    expect(await q.fail(again, 'y')).toBe('dead');
    expect(q.deadLetters).toEqual([{ job: expect.objectContaining({ jobId: 'a' }), error: 'y' }]);
    expect(q.depth()).toBe(0);
  });

  it('sheds a non-high-priority job when full', async () => {
    const q = new InMemoryExtractionQueue<TestJob>({ now }, 2);
    await q.enqueue(job('h', 'high'));
    await q.enqueue(job('n1'));
    await q.enqueue(job('n2'));
    expect(q.droppedJobs).toBe(1);
    expect((await q.claim(5)).map((l) => l.id)).toEqual(['h', 'n2']);
  });
});
