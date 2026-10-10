/**
 * One call in its own process (docs/plans/2026-10-10-process-per-job.md). Forked
 * by the worker with AGENT_JOB_CHILD=1: starts the per-process runtime, warms
 * up, says `ready`, runs one job, drains background memory work, and exits.
 * Reports its CPU share and loop utilization every 2 s for the worker's load.
 * @module agents/gce/job-child
 */

import { performance } from 'node:perf_hooks';

import { initializeLogger } from '@livekit/agents';

import { getDeepExtractionWorker } from '../../memory/dynamic/index.js';
import { setCallQualityForwarder } from '../../services/analytics/call-quality-monitor.js';
import { registerGlobalErrorHandlers } from '../../utils/safe-fire-and-forget.js';
import { drainBackground } from './drain-background.js';
import { runJobInProcess, setOnJobLifecycle, setWorkerId, shutdownJob } from './job-executor.js';
import { asToChild, decodeJob, type ToChild, type ToParent } from './job-process-protocol.js';
import { startProcessRuntime } from './process-runtime.js';
import { warmupResources } from './warmup.js';

/** Longest a finished call waits for its background memory work before the process exits. */
const DRAIN_MS = 60_000;
const LOAD_REPORT_MS = 2_000;

const log = (msg: string, data?: Record<string, unknown>): void => {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(
    `[${new Date().toISOString()}] [job-child ${process.pid}] ${msg}${dataStr}\n`
  );
};

const send = (msg: ToParent): void => {
  if (process.connected) process.send?.(msg);
};

/** Background memory work still to do: queued deep extractions plus one in progress. */
function pendingMemoryWork(): number {
  const health = getDeepExtractionWorker().getHealthStatus();
  return health.queueDepth + (health.isProcessing ? 1 : 0);
}

function reportLoad(): void {
  let lastCpu = process.cpuUsage();
  let lastWall = performance.now();
  let lastElu = performance.eventLoopUtilization();
  setInterval(() => {
    const cpu = process.cpuUsage(lastCpu);
    const wall = performance.now() - lastWall;
    const elu = performance.eventLoopUtilization(lastElu);
    lastCpu = process.cpuUsage();
    lastWall = performance.now();
    lastElu = performance.eventLoopUtilization();
    send({
      t: 'load',
      cpu: (cpu.user + cpu.system) / 1000 / Math.max(wall, 1),
      elu: elu.utilization,
    });
  }, LOAD_REPORT_MS).unref();
}

async function runOne(msg: Extract<ToChild, { t: 'job' }>, stop: () => void): Promise<void> {
  const info = decodeJob(msg);
  if (msg.workerId) setWorkerId(msg.workerId);
  setOnJobLifecycle((jobId, event) => send({ t: 'lifecycle', jobId, event }));
  try {
    await runJobInProcess(info, log);
  } catch (error) {
    // runJobInProcess already reported the job failed.
    log('Job ended with an error', { jobId: info.job.id, error: String(error) });
  }
  const left = await drainBackground(pendingMemoryWork, DRAIN_MS);
  log('Job process exiting', { jobId: info.job.id, memoryWorkLeft: left });
  stop();
  process.exit(0);
}

async function main(): Promise<void> {
  registerGlobalErrorHandlers();
  // The worker's call-quality monitor sees this call and owns its alerts.
  setCallQualityForwarder((op, args) => send({ t: 'quality', op, args }));
  initializeLogger({
    pretty: true,
    level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
  });
  const runtime = startProcessRuntime(log);
  // The worker is gone: nobody will hand this process a job or read its reports.
  process.on('disconnect', () => process.exit(0));

  const started = Date.now();
  await warmupResources(log);
  reportLoad();

  let busy = false;
  process.on('message', (raw) => {
    const msg = asToChild(raw);
    if (!msg) return;
    if (msg.t === 'shutdown') {
      shutdownJob(msg.jobId, msg.reason);
      return;
    }
    if (busy) {
      log('Already running a job; ignoring another');
      return;
    }
    busy = true;
    void runOne(msg, () => runtime.stop());
  });
  send({ t: 'ready' });
  log('Job process ready', { warmupMs: Date.now() - started });
}

if (process.env.AGENT_JOB_CHILD === '1' && process.send) {
  main().catch((error: unknown) => {
    log('Job process failed to start', { error: String(error) });
    process.exit(1);
  });
}
