/**
 * In-Process Job Executor
 *
 * @deprecated LEGACY - NOT USED IN PRODUCTION
 * Production uses the standard LiveKit child process model via voice-worker.ts.
 *
 * This was designed for Cloud Run's cold start issues, but since moving to GCE:
 * - GCE has persistent instances (no cold starts)
 * - Child process model provides better isolation
 * - This adds complexity without benefit
 *
 * CANONICAL ENTRY POINTS:
 * - voice-worker.ts (main process bootstrap)
 * - voice-agent-child.ts (child process agent)
 *
 * ──────────────────────────────────────────────
 * Original purpose (historical):
 *
 * Runs voice agent jobs directly in the main process WITHOUT forking child processes.
 *
 * WHY THIS EXISTS:
 * ----------------
 * LiveKit's default SDK uses child processes for job isolation. This works great
 * for local development but causes 30-120 second delays on Cloud Run because:
 * 1. Each child process must load the entire Node.js module graph
 * 2. Cold starts are slow
 * 3. Child process initialization times out
 *
 * This executor runs jobs in the SAME PROCESS as the worker, eliminating:
 * - Child process spawn time (~0ms vs 30-120s)
 * - Module loading time (already loaded in main process)
 * - IPC communication overhead
 *
 * TRADE-OFFS:
 * -----------
 * - No process isolation (a crash affects all jobs)
 * - Memory shared across all jobs
 * - Must handle cleanup carefully
 *
 * For Ferni's use case (single concurrent call per instance), this is perfect.
 *
 * STATUS: IMPLEMENTED BUT NOT USED
 * This executor was designed for Cloud Run but we now run on GCE which doesn't
 * have the same cold start issues. Kept for potential future use or rollback.
 */

import {
  JobContext,
  JobProcess,
  type RunningJobInfo,
  runWithJobContextAsync,
} from '@livekit/agents';
import { Room, RoomEvent } from '@livekit/rtc-node';
import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';

// ============================================================================
// TYPES
// ============================================================================

export interface InProcessExecutorOptions {
  /** The entry function to run for each job */
  entryFunc: (ctx: JobContext) => Promise<void>;
  /** Optional logger */
  logger?: Logger;
  /** Callback when a job completes */
  onJobComplete?: (jobId: string, success: boolean, durationMs: number) => void;
}

interface ActiveJob {
  ctx: JobContext;
  room: Room;
  startTime: number;
  task: Promise<void>;
}

// ============================================================================
// IN-PROCESS INFERENCE EXECUTOR (Stub)
// ============================================================================

/**
 * Stub inference executor for in-process mode.
 * We don't use inference in Ferni, but the JobContext requires one.
 */
class InProcessInferenceExecutor {
  async doInference(method: string, _data: unknown): Promise<unknown> {
    throw new Error(`Inference not supported in in-process mode: ${method}`);
  }
}

// ============================================================================
// IN-PROCESS JOB EXECUTOR
// ============================================================================

export class InProcessJobExecutor {
  private opts: InProcessExecutorOptions;
  private activeJobs = new Map<string, ActiveJob>();
  private proc: JobProcess;
  private log: (msg: string, data?: Record<string, unknown>) => void;

  constructor(opts: InProcessExecutorOptions) {
    this.opts = opts;
    this.proc = new JobProcess();

    // Simple logging
    this.log = (msg, data) => {
      const dataStr = data ? ` ${JSON.stringify(data)}` : '';
      process.stderr.write(
        `[${new Date().toISOString()}] [in-process-executor] ${msg}${dataStr}\n`
      );
    };

    this.log('In-process executor initialized', { pid: process.pid });
  }

  /**
   * Launch a job directly in the main process
   */
  async launchJob(info: RunningJobInfo): Promise<void> {
    const jobId = info.job.id;
    const startTime = Date.now();

    this.log('Launching job in-process', {
      jobId,
      roomName: info.job.room?.name,
      agentName: info.acceptArguments.name,
    });

    // Create Room
    const room = new Room();
    const closeEvent = new EventEmitter();
    let connected = false;
    let shutdown = false;

    // Handle room disconnect
    room.on(RoomEvent.Disconnected, () => {
      if (!shutdown) {
        this.log('Room disconnected unexpectedly', { jobId });
        closeEvent.emit('close', false);
      }
    });

    // Callbacks for JobContext
    const onConnect = () => {
      connected = true;
      this.log('Room connected', { jobId });
    };

    const onShutdown = (reason: string) => {
      shutdown = true;
      this.log('Job shutdown requested', { jobId, reason });
      closeEvent.emit('close', true, reason);
    };

    // Create JobContext (same as SDK does in job_proc_lazy_main.ts)
    const ctx = new JobContext(
      this.proc,
      info,
      room,
      onConnect,
      onShutdown,
      new InProcessInferenceExecutor()
    );

    // Store active job
    const jobTask = this.runJob(ctx, info, closeEvent, jobId, startTime);
    this.activeJobs.set(jobId, { ctx, room, startTime, task: jobTask });

    // Don't await - let it run in background
    void jobTask.finally(() => {
      this.activeJobs.delete(jobId);
    });
  }

  /**
   * Run the job entry function
   */
  private async runJob(
    ctx: JobContext,
    info: RunningJobInfo,
    closeEvent: EventEmitter,
    jobId: string,
    startTime: number
  ): Promise<void> {
    try {
      // Warn if room doesn't connect quickly
      const unconnectedTimeout = setTimeout(() => {
        this.log('WARNING: Room not connected after 10s - did you forget ctx.connect()?', {
          jobId,
        });
      }, 10000);

      // Run the entry function within AsyncLocalStorage context
      await runWithJobContextAsync(ctx, async () => {
        try {
          await this.opts.entryFunc(ctx);
        } finally {
          clearTimeout(unconnectedTimeout);
        }
      });

      // Wait for graceful close
      await new Promise<void>((resolve) => {
        const onClose = () => {
          resolve();
        };

        // If already shutdown, resolve immediately
        if (!ctx.room.isConnected) {
          resolve();
          return;
        }

        closeEvent.once('close', onClose);

        // Timeout for graceful close (30 seconds max)
        setTimeout(() => {
          closeEvent.off('close', onClose);
          resolve();
        }, 30000);
      });

      const durationMs = Date.now() - startTime;
      this.log('Job completed successfully', { jobId, durationMs });
      this.opts.onJobComplete?.(jobId, true, durationMs);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : String(error);
      this.log('Job failed', { jobId, durationMs, error: errMsg });
      this.opts.onJobComplete?.(jobId, false, durationMs);
    } finally {
      // Cleanup
      try {
        if (ctx.room.isConnected) {
          await ctx.room.disconnect();
        }
      } catch {
        // Ignore disconnect errors
      }
    }
  }

  /**
   * Get stats about running jobs
   */
  getStats(): { activeJobs: number; jobIds: string[] } {
    return {
      activeJobs: this.activeJobs.size,
      jobIds: Array.from(this.activeJobs.keys()),
    };
  }

  /**
   * Close all active jobs
   */
  async close(): Promise<void> {
    this.log('Closing executor', { activeJobs: this.activeJobs.size });

    for (const [jobId, job] of this.activeJobs) {
      try {
        if (job.room.isConnected) {
          await job.room.disconnect();
        }
      } catch (error) {
        this.log('Error closing job', { jobId, error: String(error) });
      }
    }

    this.activeJobs.clear();
  }
}
