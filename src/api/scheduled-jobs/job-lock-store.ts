/**
 * Firestore lock for scheduled jobs, one doc per job in `scheduled_job_locks`.
 *
 * A run holds the lock until it finishes or its lease expires. Cloud Scheduler
 * retries a job whose attempt failed, and on this service a cut-off attempt is
 * not dead: Cloud Run throttles the instance's CPU once the request ends, so
 * the old run sits frozen and resumes the moment the retry wakes the instance.
 * The lock stops the retry from running the same job a second time beside it.
 * The doc also keeps the last outcome, so a run that went wrong can be seen.
 *
 * @module api/scheduled-jobs/job-lock-store
 */

import type { DocumentReference } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../utils/firebase-admin-app.js';

export const JOB_LOCK_COLLECTION = 'scheduled_job_locks';

export interface JobOutcome {
  status: number;
  durationMs: number;
  finishedAt: number;
}

export type LockResult =
  { acquired: true } | { acquired: false; holder: string; expiresAt: number };

export interface JobLockStore {
  acquire: (job: string, runId: string, now: number, leaseMs: number) => Promise<LockResult>;
  release: (job: string, runId: string, outcome: JobOutcome) => Promise<void>;
}

interface LockDoc {
  runId?: string | null;
  expiresAt?: number;
}

export function firestoreJobLockStore(): JobLockStore {
  const ref = (job: string): DocumentReference =>
    getAdminFirestore().collection(JOB_LOCK_COLLECTION).doc(job);
  return {
    acquire: async (job, runId, now, leaseMs) =>
      getAdminFirestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref(job));
        const held = snap.exists ? (snap.data() as LockDoc) : null;
        if (held?.runId && held.runId !== runId && (held.expiresAt ?? 0) > now) {
          return { acquired: false, holder: held.runId, expiresAt: held.expiresAt ?? 0 };
        }
        tx.set(ref(job), { runId, startedAt: now, expiresAt: now + leaseMs }, { merge: true });
        return { acquired: true };
      }),
    release: async (job, runId, outcome) =>
      getAdminFirestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref(job));
        const ownsLock = snap.exists && (snap.data() as LockDoc).runId === runId;
        // A run whose lease ran out and was taken over records its outcome but
        // leaves the newer run's lock alone.
        const update = ownsLock ? { runId: null, expiresAt: 0 } : {};
        tx.set(ref(job), { ...update, lastOutcome: { ...outcome, runId } }, { merge: true });
      }),
  };
}
