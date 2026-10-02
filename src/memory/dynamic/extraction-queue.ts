/**
 * Durable queue for deep-extraction jobs.
 *
 * The worker used to keep jobs in an in-process array: the oldest job was
 * dropped at 1000 and everything queued was lost on restart or deploy. Jobs now
 * live in Firestore at bogle_users/{uid}/extraction_jobs/{jobId} (under the
 * user, so account deletion removes them with everything else).
 *
 * - claim(): leases pending jobs whose time has come (and jobs whose lease
 *   expired because a worker died mid-job) in a transaction, so two workers
 *   never run the same job.
 * - fail(): retries with exponential backoff; after maxAttempts the job is
 *   dead-lettered (status 'dead', kept with its last error for inspection,
 *   `expireAt` set for a Firestore TTL policy).
 * - complete(): deletes the job.
 * - Startup: the worker drains whatever is pending (see deep-extraction-worker).
 *
 * When Firestore is unavailable (local dev, tests) InMemoryExtractionQueue
 * gives the same interface without durability.
 *
 * Indexes: firestore.indexes.json has the collection-group indexes
 * (status, availableAt) and (status, leaseExpiresAt) for extraction_jobs.
 *
 * @module memory/dynamic/extraction-queue
 */

import { hostname } from 'node:os';
import {
  USERS_COLLECTION,
  toMillis,
  type DocData,
  type FirestoreLike,
} from './firestore-shapes.js';

export const EXTRACTION_JOBS_COLLECTION = 'extraction_jobs';

/** What the queue needs to know about a job; the payload is stored as-is. */
export interface QueueableJob {
  jobId: string;
  userId: string;
  priority: 'high' | 'normal' | 'low';
  timestamp: Date | string;
}

export interface LeasedJob<J> {
  /** Queue id (the Firestore doc id, or the in-memory id). */
  id: string;
  job: J;
  /** Attempts including this one. */
  attempts: number;
}

export interface QueueOptions {
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  leaseMs?: number;
  /** How long dead-lettered jobs are kept before TTL deletes them. */
  deadLetterTtlMs?: number;
  now?: () => number;
}

export interface ExtractionQueue<J extends QueueableJob> {
  readonly durable: boolean;
  enqueue(job: J): Promise<void>;
  claim(max: number): Promise<Array<LeasedJob<J>>>;
  complete(leased: LeasedJob<J>): Promise<void>;
  /** Returns 'retry' when it will run again, 'dead' when dead-lettered. */
  fail(leased: LeasedJob<J>, error: string): Promise<'retry' | 'dead'>;
  /** Jobs known to be waiting (exact for in-memory, last-seen for Firestore). */
  depth(): number;
}

const DEFAULTS = {
  maxAttempts: 5,
  baseBackoffMs: 5_000,
  maxBackoffMs: 15 * 60_000,
  leaseMs: 2 * 60_000,
  deadLetterTtlMs: 30 * 24 * 60 * 60_000,
};

/** Exponential backoff with full jitter capped at maxBackoffMs. attempts >= 1. */
export function backoffMs(
  attempts: number,
  base = DEFAULTS.baseBackoffMs,
  max = DEFAULTS.maxBackoffMs,
  random: () => number = Math.random
): number {
  const ceiling = Math.min(max, base * 2 ** Math.max(0, attempts - 1));
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

/** Firestore doc ids cannot contain '/' and are capped at 1500 bytes. */
export function queueDocId(jobId: string): string {
  return jobId.replace(/[/\\#?]/g, '_').slice(0, 300);
}

/**
 * Jobs are claimed in availableAt order; a head start puts high priority jobs
 * first and low after normal, without delaying any of them.
 */
const PRIORITY_HEAD_START_MS: Record<QueueableJob['priority'], number> = {
  high: 60_000,
  normal: 1,
  low: 0,
};

function serialize<J extends QueueableJob>(job: J): DocData {
  const ts = job.timestamp instanceof Date ? job.timestamp.toISOString() : String(job.timestamp);
  return JSON.parse(JSON.stringify({ ...job, timestamp: ts })) as DocData;
}

function deserialize<J extends QueueableJob>(data: unknown): J {
  const job = data as J & { timestamp: string };
  return { ...job, timestamp: new Date(job.timestamp) };
}

export class FirestoreExtractionQueue<J extends QueueableJob> implements ExtractionQueue<J> {
  readonly durable = true;
  private readonly opts: Required<Omit<QueueOptions, 'now'>>;
  private readonly now: () => number;
  private readonly owner = `${hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  /** Last claim's view of the backlog, for health reporting. */
  private lastSeenDepth = 0;
  /** Where each leased job lives (userId is part of the path). */
  private readonly leasedUser = new Map<string, string>();

  constructor(
    private readonly db: FirestoreLike,
    options: QueueOptions = {}
  ) {
    this.opts = { ...DEFAULTS, ...stripUndefined(options) };
    this.now = options.now ?? Date.now;
  }

  private ref(userId: string, id: string) {
    return this.db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(EXTRACTION_JOBS_COLLECTION)
      .doc(id);
  }

  async enqueue(job: J): Promise<void> {
    const now = this.now();
    await this.ref(job.userId, queueDocId(job.jobId)).set({
      userId: job.userId,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.opts.maxAttempts,
      createdAt: new Date(now),
      availableAt: new Date(now - PRIORITY_HEAD_START_MS[job.priority]),
      job: serialize(job),
    });
    this.lastSeenDepth++;
  }

  async claim(max: number): Promise<Array<LeasedJob<J>>> {
    const now = new Date(this.now());
    const group = this.db.collectionGroup(EXTRACTION_JOBS_COLLECTION);
    const [ready, expired] = await Promise.all([
      group
        .where('status', '==', 'pending')
        .where('availableAt', '<=', now)
        .orderBy('availableAt')
        .limit(max)
        .get(),
      group
        .where('status', '==', 'leased')
        .where('leaseExpiresAt', '<=', now)
        .orderBy('leaseExpiresAt')
        .limit(max)
        .get(),
    ]);
    this.lastSeenDepth = ready.size;

    const claimed: Array<LeasedJob<J>> = [];
    for (const doc of [...ready.docs, ...expired.docs]) {
      if (claimed.length >= max) break;
      const leased = await this.db.runTransaction(async (tx) => {
        const snap = await tx.get(doc.ref);
        const data = snap.data();
        if (!snap.exists || !data) return null;
        const t = this.now();
        const claimable =
          (data.status === 'pending' && toMillis(data.availableAt) <= t) ||
          (data.status === 'leased' && toMillis(data.leaseExpiresAt) <= t);
        if (!claimable) return null;
        const attempts = (typeof data.attempts === 'number' ? data.attempts : 0) + 1;
        if (attempts > this.opts.maxAttempts) {
          // Its lease kept expiring: the job takes the worker down. Dead-letter it.
          tx.update(doc.ref, {
            status: 'dead',
            lastError: 'lease expired on every attempt',
            deadAt: new Date(t),
            expireAt: new Date(t + this.opts.deadLetterTtlMs),
            leaseOwner: null,
            leaseExpiresAt: null,
          });
          return null;
        }
        tx.update(doc.ref, {
          status: 'leased',
          attempts,
          leaseOwner: this.owner,
          leaseExpiresAt: new Date(t + this.opts.leaseMs),
        });
        return { id: doc.id, job: deserialize<J>(data.job), attempts, userId: String(data.userId) };
      });
      if (leased) {
        this.leasedUser.set(leased.id, leased.userId);
        claimed.push({ id: leased.id, job: leased.job, attempts: leased.attempts });
      }
    }
    return claimed;
  }

  async complete(leased: LeasedJob<J>): Promise<void> {
    const userId = this.leasedUser.get(leased.id) ?? leased.job.userId;
    this.leasedUser.delete(leased.id);
    await this.ref(userId, leased.id).delete();
  }

  async fail(leased: LeasedJob<J>, error: string): Promise<'retry' | 'dead'> {
    const userId = this.leasedUser.get(leased.id) ?? leased.job.userId;
    this.leasedUser.delete(leased.id);
    const t = this.now();
    const lastError = error.slice(0, 1000);
    if (leased.attempts >= this.opts.maxAttempts) {
      await this.ref(userId, leased.id).update({
        status: 'dead',
        lastError,
        deadAt: new Date(t),
        expireAt: new Date(t + this.opts.deadLetterTtlMs),
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      return 'dead';
    }
    await this.ref(userId, leased.id).update({
      status: 'pending',
      lastError,
      availableAt: new Date(
        t + backoffMs(leased.attempts, this.opts.baseBackoffMs, this.opts.maxBackoffMs)
      ),
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    return 'retry';
  }

  depth(): number {
    return this.lastSeenDepth;
  }
}

interface MemoryEntry<J> {
  id: string;
  job: J;
  attempts: number;
  availableAt: number;
  status: 'pending' | 'leased';
}

/** Non-durable fallback with the same retry/dead-letter behaviour. */
export class InMemoryExtractionQueue<J extends QueueableJob> implements ExtractionQueue<J> {
  readonly durable = false;
  readonly deadLetters: Array<{ job: J; error: string }> = [];
  private entries: Array<MemoryEntry<J>> = [];
  private readonly opts: Required<Omit<QueueOptions, 'now'>>;
  private readonly now: () => number;
  droppedJobs = 0;

  constructor(
    options: QueueOptions = {},
    private readonly maxSize = 1000
  ) {
    this.opts = { ...DEFAULTS, ...stripUndefined(options) };
    this.now = options.now ?? Date.now;
  }

  async enqueue(job: J): Promise<void> {
    if (this.entries.length >= this.maxSize) {
      // Only reachable without Firestore (dev/tests): shed the lowest-priority, oldest job.
      const idx = this.entries.findIndex(
        (e) => e.job.priority !== 'high' && e.status === 'pending'
      );
      this.entries.splice(idx >= 0 ? idx : 0, 1);
      this.droppedJobs++;
    }
    const entry: MemoryEntry<J> = {
      id: job.jobId,
      job,
      attempts: 0,
      availableAt: this.now() - PRIORITY_HEAD_START_MS[job.priority],
      status: 'pending',
    };
    if (job.priority === 'high') this.entries.unshift(entry);
    else this.entries.push(entry);
  }

  async claim(max: number): Promise<Array<LeasedJob<J>>> {
    const t = this.now();
    const ready = this.entries
      .filter((e) => e.status === 'pending' && e.availableAt <= t)
      .sort((a, b) => a.availableAt - b.availableAt)
      .slice(0, max);
    for (const e of ready) {
      e.status = 'leased';
      e.attempts++;
    }
    return ready.map((e) => ({ id: e.id, job: e.job, attempts: e.attempts }));
  }

  async complete(leased: LeasedJob<J>): Promise<void> {
    this.entries = this.entries.filter((e) => e.id !== leased.id);
  }

  async fail(leased: LeasedJob<J>, error: string): Promise<'retry' | 'dead'> {
    const entry = this.entries.find((e) => e.id === leased.id);
    if (!entry) return 'dead';
    if (entry.attempts >= this.opts.maxAttempts) {
      this.entries = this.entries.filter((e) => e !== entry);
      this.deadLetters.push({ job: entry.job, error });
      if (this.deadLetters.length > 100) this.deadLetters.shift();
      return 'dead';
    }
    entry.status = 'pending';
    entry.availableAt =
      this.now() + backoffMs(entry.attempts, this.opts.baseBackoffMs, this.opts.maxBackoffMs);
    return 'retry';
  }

  depth(): number {
    return this.entries.length;
  }
}

function stripUndefined(o: QueueOptions): Partial<typeof DEFAULTS> {
  const out: Partial<typeof DEFAULTS> = {};
  for (const k of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) {
    const v = o[k];
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}
