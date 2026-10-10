/**
 * A pool of prewarmed child processes, one call each
 * (docs/plans/2026-10-10-process-per-job.md). Calls on one event loop starve
 * each other (dev: VAD lag 0.5 s alone, 8-41 s with two); a process per call
 * gives each its own loop and lets a pod use all its CPUs.
 *
 * The worker keeps `idle` children warmed and ready. An assigned job goes to a
 * ready child, and a new idle child starts. A child runs one job, then exits.
 *
 * @module agents/gce/job-process-pool
 */

import type { ChildProcess } from 'node:child_process';

import type { JobInfo } from './job-executor.js';
import { asToParent, encodeJob, type JobLifecycle, type ToChild } from './job-process-protocol.js';

type LogFn = (msg: string, data?: Record<string, unknown>) => void;

export interface JobProcessPoolOptions {
  /** Starts a child running gce/job-child (an IPC channel is required). */
  spawn: () => ChildProcess;
  /** Prewarmed children to keep ready. */
  idle: number;
  /** How long to wait for a child to warm up before failing the job. */
  readyTimeoutMs: number;
  log: LogFn;
  onLifecycle: (jobId: string, event: JobLifecycle) => void;
}

interface Child {
  proc: ChildProcess;
  ready: boolean;
  exited: boolean;
  jobId: string | null;
  /** Set once the job reported completed or failed (or the child died with it). */
  finished: boolean;
  load: { cpu: number; elu: number };
  readyWaiters: Array<() => void>;
  onFinished?: () => void;
}

export class JobProcessPool {
  private readonly children = new Set<Child>();
  private closed = false;

  constructor(private readonly opts: JobProcessPoolOptions) {}

  start(): void {
    this.fill();
  }

  /** Jobs running in a child right now. */
  activeJobIds(): string[] {
    return [...this.children].filter((c) => c.jobId && !c.finished).map((c) => c.jobId as string);
  }

  /**
   * Load across the children: their summed CPU share of the pod's `cpus`, or
   * the busiest child's event-loop utilization, whichever is larger.
   */
  load(cpus: number): number {
    let cpu = 0;
    let elu = 0;
    for (const c of this.children) {
      if (c.exited) continue;
      cpu += c.load.cpu;
      elu = Math.max(elu, c.load.elu);
    }
    return Math.min(Math.max(cpu / Math.max(cpus, 1), elu, 0), 1);
  }

  /** Runs a job in a ready child; resolves when the job finishes or its child dies. */
  async run(info: JobInfo, workerId?: string): Promise<void> {
    const child = await this.takeReady(info.job.id);
    const finished = new Promise<void>((resolve) => {
      child.onFinished = resolve;
    });
    this.send(child, encodeJob(info, workerId));
    this.opts.log('Job handed to child process', { jobId: info.job.id, pid: child.proc.pid });
    this.fill();
    await finished;
  }

  /** Asks the job's child to end the session (LiveKit terminated the job). */
  shutdown(jobId: string, reason: string): boolean {
    const child = [...this.children].find((c) => c.jobId === jobId && !c.finished);
    if (!child) return false;
    this.send(child, { t: 'shutdown', jobId, reason });
    return true;
  }

  close(): void {
    this.closed = true;
    for (const c of this.children) if (!c.exited) c.proc.kill('SIGTERM');
  }

  private fill(): void {
    if (this.closed) return;
    const idle = [...this.children].filter((c) => !c.exited && !c.jobId).length;
    for (let i = idle; i < this.opts.idle; i++) this.spawnChild();
  }

  private spawnChild(): Child {
    const proc = this.opts.spawn();
    const child: Child = {
      proc,
      ready: false,
      exited: false,
      jobId: null,
      finished: false,
      load: { cpu: 0, elu: 0 },
      readyWaiters: [],
    };
    this.children.add(child);
    proc.on('message', (raw) => {
      const msg = asToParent(raw);
      if (!msg) return;
      if (msg.t === 'ready') {
        child.ready = true;
        for (const wake of child.readyWaiters.splice(0)) wake();
      } else if (msg.t === 'load') {
        child.load = { cpu: msg.cpu, elu: msg.elu };
      } else if (msg.t === 'lifecycle') {
        this.opts.onLifecycle(msg.jobId, msg.event);
        if (msg.event !== 'started') this.finish(child);
      }
    });
    proc.on('exit', (code, signal) => {
      child.exited = true;
      this.children.delete(child);
      for (const wake of child.readyWaiters.splice(0)) wake();
      if (child.jobId && !child.finished) {
        this.opts.log('Child process died during its job', {
          jobId: child.jobId,
          pid: proc.pid,
          code,
          signal,
        });
        this.opts.onLifecycle(child.jobId, 'failed');
        this.finish(child);
      }
      this.fill();
    });
    return child;
  }

  private finish(child: Child): void {
    if (child.finished) return;
    child.finished = true;
    child.onFinished?.();
  }

  /**
   * Claims a warmed idle child for `jobId`, waiting for one to become ready if
   * none is. The claim is synchronous, so two jobs assigned at once never share
   * a child.
   */
  private async takeReady(jobId: string): Promise<Child> {
    const deadline = Date.now() + this.opts.readyTimeoutMs;
    for (;;) {
      const idle = [...this.children].filter((c) => !c.exited && !c.jobId);
      const ready = idle.find((c) => c.ready);
      if (ready) {
        ready.jobId = jobId;
        return ready;
      }
      const waitOn = idle[0] ?? this.spawnChild();
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('No child process ready in time');
      // eslint-disable-next-line no-await-in-loop -- wait for the next child to warm up
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        waitOn.readyWaiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  private send(child: Child, msg: ToChild): void {
    try {
      child.proc.send(msg);
    } catch (error) {
      this.opts.log('Could not message child process', {
        pid: child.proc.pid,
        error: String(error),
      });
    }
  }
}
