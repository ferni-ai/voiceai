/**
 * CALL_CPU_PROFILE=on: sample the start of a call with the V8 profiler and log
 * CPU_PROFILE, what ran overall and inside each of the call's worst event-loop
 * stalls (loop-watch.ts). LOOP_STALL says when the loop blocked; this says by
 * what. CALL_CPU_PROFILE_SECONDS (default 30, max 300) bounds the sample. Off
 * by default: sampling costs a few percent of CPU.
 *
 * @module agents/shared/call-cpu-profile
 */
import { getLogger } from '../../utils/safe-logger.js';
import { type CpuProfile, summarizeCpuProfile } from './cpu-profile-summary.js';
import type { Stall } from './loop-watch.js';

const log = getLogger();

interface InspectorSession {
  connect: () => void;
  disconnect: () => void;
  post: (method: string, params: object, cb: (err: Error | null, res?: unknown) => void) => void;
}

/** One profile per process at a time: the inspector has one profiler. */
let profiling = false;

async function post(s: InspectorSession, method: string, params: object = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    s.post(method, params, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

/** Starts the V8 profiler; the returned stop gives the profile. */
async function startProfile(): Promise<(() => Promise<CpuProfile | null>) | null> {
  if (profiling) return null;
  profiling = true;
  try {
    const { Session } = await import('node:inspector');
    const s = new Session() as unknown as InspectorSession;
    s.connect();
    await post(s, 'Profiler.enable');
    await post(s, 'Profiler.setSamplingInterval', { interval: 1000 });
    await post(s, 'Profiler.start');
    return async () => {
      try {
        const res = (await post(s, 'Profiler.stop')) as { profile?: CpuProfile };
        return res.profile ?? null;
      } finally {
        s.disconnect();
        profiling = false;
      }
    };
  } catch (error) {
    profiling = false;
    log.warn({ error: String(error) }, 'CPU profile could not start');
    return null;
  }
}

/** Epoch ms -> the profiler's monotonic microseconds. */
function toProfileClock(
  profile: CpuProfile,
  wall0: number,
  mono0: number
): (epochMs: number) => number {
  // V8's profile clock and hrtime are both CLOCK_MONOTONIC; trust the profile if they disagree.
  const base = Math.abs(profile.startTime - mono0) > 5e6 ? profile.startTime : mono0;
  return (epochMs: number): number => base + (epochMs - wall0) * 1000;
}

function profileSeconds(env: Record<string, string | undefined>): number {
  const n = Number(env.CALL_CPU_PROFILE_SECONDS);
  return n > 0 ? Math.min(n, 300) : 30;
}

/**
 * Profiles the call when the flag is on; `stalls` is the call's live stall list.
 * The returned finish (also run by a timer) logs CPU_PROFILE once.
 */
export function profileCall(
  jobId: string,
  startedAt: number,
  stalls: readonly Stall[],
  env: Record<string, string | undefined> = process.env
): () => void {
  if (env.CALL_CPU_PROFILE !== 'on') return () => {};
  const wall0 = Date.now();
  const mono0 = Number(process.hrtime.bigint() / 1000n);
  const started = startProfile();
  let done = false;
  const finish = async (): Promise<void> => {
    if (done) return;
    done = true;
    const stop = await started;
    const profile = stop ? await stop() : null;
    if (!profile) return;
    const clock = toProfileClock(profile, wall0, mono0);
    const windows = [...stalls]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 8)
      .map((s) => ({
        label: `+${s.at - s.ms - startedAt}ms ${s.ms}ms ${s.agentState}`,
        startUs: clock(s.at - s.ms),
        endUs: clock(s.at),
      }));
    log.info({ jobId, ...summarizeCpuProfile(profile, windows) }, 'CPU_PROFILE');
  };
  setTimeout(() => void finish(), profileSeconds(env) * 1000).unref?.();
  return () => void finish();
}
