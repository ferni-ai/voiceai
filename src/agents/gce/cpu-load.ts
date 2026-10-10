/**
 * Real CPU load for the worker's UpdateWorker messages.
 *
 * `os.loadavg()` reads 0 inside the LiveKit Cloud container, so the worker
 * used to report load 0 while it was saturated, and LiveKit kept sending it
 * calls. This samples the process's own CPU time (all threads, including the
 * VAD and Rust audio) against the container's CPU quota from cgroup v2
 * `cpu.max`; `os.cpus()` can report the host's cores rather than the quota.
 * Every call runs on one Node event loop, so a saturated loop is only about
 * 1/N of the CPUs: load is the larger of CPU share and event-loop utilization.
 */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

/** Above this load the worker reports itself full (the stock agents default). */
export const FULL_LOAD_THRESHOLD = 0.7;

/**
 * Calls one worker takes at once. Two calls on one worker starve its shared event loop (dev:
 * VAD lag p50 0.5 s alone, 8.2 s / max 41 s with two), so one until that's fixed.
 * AGENT_MAX_JOBS_PER_WORKER raises it without a code change.
 */
export function maxJobsPerWorker(env: string | undefined = process.env.AGENT_MAX_JOBS_PER_WORKER): number {
  const n = Number(env);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** The worker takes no new calls at its job cap or once real CPU load crosses the threshold. */
export function workerIsFull(activeJobs: number, load: number, maxJobs = maxJobsPerWorker()): boolean {
  return activeJobs >= maxJobs || load >= FULL_LOAD_THRESHOLD;
}

/** Usable CPUs: NUM_CPUS override, else cgroup v2 `cpu.max` quota/period, else `fallback`. */
export function parseCpuCount(cpuMax: string | null, numCpusEnv: string | undefined, fallback: number): number {
  const fromEnv = numCpusEnv === undefined ? NaN : parseFloat(numCpusEnv);
  if (fromEnv > 0) return fromEnv;
  const [quota, period] = (cpuMax ?? '').trim().split(/\s+/);
  const q = Number(quota);
  const p = Number(period);
  if (quota !== 'max' && q > 0 && p > 0) return q / p;
  return fallback > 0 ? fallback : 1;
}

/** Fraction of the available CPUs used over an interval, clamped to [0, 1]. */
export function computeLoad(cpuMicros: number, wallMicros: number, cpus: number): number {
  if (wallMicros <= 0 || cpus <= 0) return 0;
  return Math.min(Math.max(cpuMicros / (wallMicros * cpus), 0), 1);
}

export interface CpuLoadSamplerDeps {
  cpuMicros: () => number; // process CPU time so far (user + system)
  nowMicros: () => number; // monotonic wall clock
  cpus: number;
  eventLoopBusy?: () => number; // event-loop utilization since the last call (0..1)
  smoothing?: number; // EMA weight of the newest sample (0..1]
}

/** Each `sample()` returns the smoothed load since the previous call. */
export function createCpuLoadSampler(deps: CpuLoadSamplerDeps): { sample: () => number } {
  const alpha = deps.smoothing ?? 0.5;
  let lastCpu = deps.cpuMicros();
  let lastWall = deps.nowMicros();
  let smoothed = 0;
  return {
    sample(): number {
      const cpu = deps.cpuMicros();
      const wall = deps.nowMicros();
      const cpuShare = computeLoad(cpu - lastCpu, wall - lastWall, deps.cpus);
      const load = Math.max(cpuShare, Math.min(Math.max(deps.eventLoopBusy?.() ?? 0, 0), 1));
      lastCpu = cpu;
      lastWall = wall;
      smoothed = alpha * load + (1 - alpha) * smoothed;
      return smoothed;
    },
  };
}

function readCpuMax(): string | null {
  try {
    return readFileSync('/sys/fs/cgroup/cpu.max', 'utf8');
  } catch {
    return null; // not cgroup v2 (macOS, local dev): fall back to os.cpus()
  }
}

let lastElu = performance.eventLoopUtilization();

/** Sampler for this process, sized to the container's CPU quota. */
export function createProcessCpuLoadSampler(): { sample: () => number } {
  return createCpuLoadSampler({
    cpuMicros: () => {
      const { user, system } = process.cpuUsage();
      return user + system;
    },
    nowMicros: () => Number(process.hrtime.bigint() / 1000n),
    cpus: parseCpuCount(readCpuMax(), process.env.NUM_CPUS, os.cpus().length),
    eventLoopBusy: () => {
      const now = performance.eventLoopUtilization();
      const delta = performance.eventLoopUtilization(now, lastElu);
      lastElu = now;
      return delta.utilization;
    },
  });
}
