/**
 * Where the worker runs a call: on its own event loop (default), or in a
 * prewarmed child process per call with AGENT_JOB_EXECUTOR=process
 * (docs/plans/2026-10-10-process-per-job.md). The LiveKit connection talks to
 * this, never to the executors directly.
 *
 * @module agents/gce/job-runner
 */

import { fork } from 'node:child_process';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { podCpuCount } from './cpu-load.js';
import {
  getActiveJobIds,
  getActiveJobs,
  getWorkerId,
  runJobInProcess,
  setOnJobLifecycle,
  shutdownJob,
  type JobInfo,
  type LogFn,
} from './job-executor.js';
import { JobProcessPool } from './job-process-pool.js';
import type { JobLifecycle } from './job-process-protocol.js';

export type JobExecutorMode = 'inproc' | 'process';

export function jobExecutorMode(
  env: Record<string, string | undefined> = process.env
): JobExecutorMode {
  return env.AGENT_JOB_EXECUTOR === 'process' ? 'process' : 'inproc';
}

/** Warmed children kept ready (AGENT_IDLE_PROCESSES, default 1). */
export function idleProcesses(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AGENT_IDLE_PROCESSES);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

/** A child's warmup is ~10-30 s; past this the job fails rather than leaving the caller waiting. */
const READY_TIMEOUT_MS = 90_000;

let pool: JobProcessPool | null = null;
let lifecycle: ((jobId: string, event: JobLifecycle) => void) | null = null;

/** The child entry beside this file: .ts under tsx (dev), .js when built. */
function childEntry(): string {
  const self = fileURLToPath(import.meta.url);
  return fileURLToPath(new URL(`./job-child${extname(self)}`, import.meta.url));
}

/** In process mode, starts the pool so a warmed child is ready before the first job. */
export function startJobRunner(log: LogFn, mode: JobExecutorMode = jobExecutorMode()): void {
  if (mode !== 'process' || pool) return;
  const entry = childEntry();
  pool = new JobProcessPool({
    spawn: () =>
      fork(entry, [], {
        execArgv: process.execArgv,
        env: { ...process.env, AGENT_JOB_CHILD: '1' },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      }),
    idle: idleProcesses(),
    readyTimeoutMs: READY_TIMEOUT_MS,
    log,
    onLifecycle: (jobId, event) => lifecycle?.(jobId, event),
  });
  pool.start();
  log('Job executor: one process per call', { idle: idleProcesses(), entry });
}

export function stopJobRunner(): void {
  pool?.close();
  pool = null;
}

/** Called on every job start, completion and failure, in either mode. */
export function setJobLifecycleListener(cb: (jobId: string, event: JobLifecycle) => void): void {
  lifecycle = cb;
  setOnJobLifecycle(cb);
}

export async function runJob(info: JobInfo, log: LogFn): Promise<void> {
  if (!pool) return runJobInProcess(info, log);
  try {
    await pool.run(info, getWorkerId());
  } catch (error) {
    lifecycle?.(info.job.id, 'failed');
    throw error;
  }
}

export function activeJobCount(): number {
  return pool ? pool.activeJobIds().length : getActiveJobs();
}

export function activeJobIds(): string[] {
  return pool ? pool.activeJobIds() : getActiveJobIds();
}

/** LiveKit terminated a job: end its session. False if it isn't running here. */
export function terminateJob(jobId: string, reason: string): boolean {
  return pool ? pool.shutdown(jobId, reason) : shutdownJob(jobId, reason);
}

/** The worker's load: its own, or its children's when they run the calls. */
export function workerLoad(ownLoad: number): number {
  return pool ? Math.max(ownLoad, pool.load(podCpuCount())) : ownLoad;
}
