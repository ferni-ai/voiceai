/**
 * Messages between the worker and a per-call child process
 * (docs/plans/2026-10-10-process-per-job.md). The job travels as its protobuf
 * bytes, base64, so the child rebuilds the exact `Job` LiveKit assigned.
 *
 * @module agents/gce/job-process-protocol
 */

import { Job } from '@livekit/protocol';

import type { CallQualityOp } from '../../services/analytics/call-quality-monitor.js';

import type { JobInfo } from './job-executor.js';

export type JobLifecycle = 'started' | 'completed' | 'failed';

/** Worker → child. */
export type ToChild =
  | {
      t: 'job';
      job: string;
      url: string;
      token: string;
      acceptArgs: JobInfo['acceptArgs'];
      /** The worker's LiveKit id, which the job reports as its worker. */
      workerId?: string;
    }
  | { t: 'shutdown'; jobId: string; reason: string };

/** Child → worker. */
export type ToParent =
  | { t: 'ready' }
  | { t: 'lifecycle'; jobId: string; event: JobLifecycle }
  /** Since the last report: share of one CPU used, and event-loop utilization. */
  | { t: 'load'; cpu: number; elu: number }
  /** A call-quality monitor call, replayed in the worker (call-quality-monitor.ts). */
  | { t: 'quality'; op: CallQualityOp; args: unknown[] };

export function encodeJob(info: JobInfo, workerId?: string): Extract<ToChild, { t: 'job' }> {
  return {
    t: 'job',
    workerId,
    job: Buffer.from(info.job.toBinary()).toString('base64'),
    url: info.url,
    token: info.token,
    acceptArgs: info.acceptArgs,
  };
}

export function decodeJob(msg: Extract<ToChild, { t: 'job' }>): JobInfo {
  return {
    job: Job.fromBinary(Buffer.from(msg.job, 'base64')),
    url: msg.url,
    token: msg.token,
    acceptArgs: msg.acceptArgs,
  };
}

/** A message from the other side, or null if it isn't one of ours. */
export function asToParent(msg: unknown): ToParent | null {
  const t = (msg as { t?: unknown } | null)?.t;
  return t === 'ready' || t === 'lifecycle' || t === 'load' || t === 'quality'
    ? (msg as ToParent)
    : null;
}

export function asToChild(msg: unknown): ToChild | null {
  const t = (msg as { t?: unknown } | null)?.t;
  return t === 'job' || t === 'shutdown' ? (msg as ToChild) : null;
}
