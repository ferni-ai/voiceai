/**
 * CALL_MEMORY_TRACE=on: what a call's process holds in memory while the call
 * runs. Every minute it logs CALL_MEMORY (RSS, heap, external, array buffers);
 * every five minutes, and once more after the call's cleanup, it logs
 * HEAP_SAMPLE: the sampling heap profiler's live allocations since the call
 * started, by allocating function and by owner (heap-sample-summary.ts).
 *
 * Why: a worker's heap grew about 20 MB a minute during a long call, and
 * nothing in the call's process (the child with AGENT_JOB_EXECUTOR=process)
 * logged its memory at all. A heap snapshot can't be fetched from a LiveKit
 * Cloud pod; these lines land in Cloud Logging. Off by default: sampling costs
 * a little CPU and memory.
 *
 * @module agents/shared/call-memory-trace
 */
import { type Env, flagOn } from '../../config/env-flag.js';
import { getLogger } from '../../utils/safe-logger.js';
import { type HeapSampleProfile, summarizeHeapSample } from './heap-sample-summary.js';

const log = getLogger();

const MEMORY_EVERY_MS = 60_000;
const SAMPLE_EVERY_MS = 5 * 60_000;
/** Bytes between samples: coarse enough to stay cheap through a long call. */
const SAMPLING_INTERVAL_BYTES = 128 * 1024;

/** The slice of node:inspector's Session the trace uses. */
export interface HeapProfilerSession {
  connect: () => void;
  disconnect: () => void;
  post: (method: string, params: object, cb: (err: Error | null, res?: unknown) => void) => void;
}

export interface CallMemoryTraceDeps {
  memoryUsage: () => NodeJS.MemoryUsage;
  openSession: () => Promise<HeapProfilerSession>;
  now: () => number;
}

const realDeps: CallMemoryTraceDeps = {
  memoryUsage: () => process.memoryUsage(),
  openSession: async () => {
    const { Session } = await import('node:inspector');
    const s = new Session();
    return {
      connect: () => s.connect(),
      disconnect: () => s.disconnect(),
      post: (method, params, cb) => s.post(method, params, cb),
    };
  },
  now: () => Date.now(),
};

/** One trace per process at a time: the inspector has one heap profiler. */
let tracing = false;

const mb = (bytes: number): number => Math.round(bytes / 1048576);

function post(s: HeapProfilerSession, method: string, params: object = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    s.post(method, params, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

/** Starts the trace when the flag is on; the returned finish logs the last sample and stops. */
export function traceCallMemory(
  jobId: string,
  env: Env = process.env,
  deps: CallMemoryTraceDeps = realDeps
): () => Promise<void> {
  if (!flagOn('CALL_MEMORY_TRACE', env) || tracing) return async () => {};
  tracing = true;
  const startedAt = deps.now();
  const minute = (): number => Math.round((deps.now() - startedAt) / 60_000);

  const logMemory = (): void => {
    const m = deps.memoryUsage();
    log.info(
      {
        jobId,
        minute: minute(),
        rssMb: mb(m.rss),
        heapUsedMb: mb(m.heapUsed),
        heapTotalMb: mb(m.heapTotal),
        externalMb: mb(m.external),
        arrayBuffersMb: mb(m.arrayBuffers),
      },
      'CALL_MEMORY'
    );
  };

  const session = (async (): Promise<HeapProfilerSession | null> => {
    try {
      const s = await deps.openSession();
      s.connect();
      await post(s, 'HeapProfiler.startSampling', { samplingInterval: SAMPLING_INTERVAL_BYTES });
      return s;
    } catch (error) {
      log.warn({ jobId, error: String(error) }, 'CALL_MEMORY_TRACE: heap sampling could not start');
      return null;
    }
  })();

  const logSample = async (phase: 'call' | 'after-cleanup'): Promise<void> => {
    const s = await session;
    if (!s) return;
    try {
      const res = (await post(s, 'HeapProfiler.getSamplingProfile')) as {
        profile?: HeapSampleProfile;
      };
      if (res.profile) {
        log.info(
          { jobId, minute: minute(), phase, ...summarizeHeapSample(res.profile) },
          'HEAP_SAMPLE'
        );
      }
    } catch (error) {
      log.warn({ jobId, error: String(error) }, 'CALL_MEMORY_TRACE: heap sample failed');
    }
  };

  logMemory();
  const memoryTimer = setInterval(logMemory, MEMORY_EVERY_MS);
  const sampleTimer = setInterval(() => void logSample('call'), SAMPLE_EVERY_MS);
  memoryTimer.unref?.();
  sampleTimer.unref?.();

  let finished = false;
  return async () => {
    if (finished) return;
    finished = true;
    clearInterval(memoryTimer);
    clearInterval(sampleTimer);
    logMemory();
    await logSample('after-cleanup');
    const s = await session;
    try {
      if (s) await post(s, 'HeapProfiler.stopSampling');
    } catch {
      // The profile is already logged; stopping is best effort.
    } finally {
      s?.disconnect();
      tracing = false;
    }
  };
}
