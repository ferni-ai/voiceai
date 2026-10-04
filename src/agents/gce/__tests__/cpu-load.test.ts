import { describe, expect, it } from 'vitest';
import { computeLoad, createCpuLoadSampler, FULL_LOAD_THRESHOLD, parseCpuCount, workerIsFull } from '../cpu-load.js';

describe('parseCpuCount', () => {
  it('uses the cgroup v2 quota, not the host core count', () => {
    expect(parseCpuCount('200000 100000\n', undefined, 32)).toBe(2);
  });

  it('honours a NUM_CPUS override first', () => {
    expect(parseCpuCount('200000 100000', '4', 32)).toBe(4);
  });

  it('falls back to os.cpus() when the quota is unlimited or the file is missing', () => {
    expect(parseCpuCount('max 100000', undefined, 8)).toBe(8);
    expect(parseCpuCount(null, undefined, 8)).toBe(8);
  });

  it('never returns zero CPUs', () => {
    expect(parseCpuCount(null, 'garbage', 0)).toBe(1);
  });
});

describe('computeLoad', () => {
  it('is CPU time over wall time times CPUs', () => {
    expect(computeLoad(1_500_000, 1_000_000, 2)).toBe(0.75);
  });

  it('clamps to [0, 1] and survives a zero interval', () => {
    expect(computeLoad(5_000_000, 1_000_000, 2)).toBe(1);
    expect(computeLoad(-1, 1_000_000, 2)).toBe(0);
    expect(computeLoad(100, 0, 2)).toBe(0);
  });
});

describe('createCpuLoadSampler', () => {
  function fakeClock(): { cpu: number; wall: number } {
    return { cpu: 0, wall: 0 };
  }

  it('reports a saturated process above the full threshold (the bug: it reported 0)', () => {
    const t = fakeClock();
    const sampler = createCpuLoadSampler({ cpuMicros: () => t.cpu, nowMicros: () => t.wall, cpus: 2 });
    for (let i = 0; i < 4; i++) {
      t.wall += 2_500_000; // one 2.5 s status interval
      t.cpu += 2 * 2_500_000 * 0.95; // 95% of both CPUs
      sampler.sample();
    }
    t.wall += 2_500_000;
    t.cpu += 2 * 2_500_000 * 0.95;
    expect(sampler.sample()).toBeGreaterThan(FULL_LOAD_THRESHOLD);
  });

  it('reports an idle process near zero', () => {
    const t = fakeClock();
    const sampler = createCpuLoadSampler({ cpuMicros: () => t.cpu, nowMicros: () => t.wall, cpus: 2 });
    t.wall += 2_500_000;
    t.cpu += 50_000; // 1% of one CPU
    expect(sampler.sample()).toBeLessThan(0.05);
  });

  it('smooths a single spike so one busy interval does not mark the worker full', () => {
    const t = fakeClock();
    const sampler = createCpuLoadSampler({ cpuMicros: () => t.cpu, nowMicros: () => t.wall, cpus: 2, smoothing: 0.5 });
    t.wall += 2_500_000;
    t.cpu += 2 * 2_500_000; // one interval at 100%
    expect(sampler.sample()).toBe(0.5);
  });
});

describe('event-loop saturation', () => {
  it('a pegged event loop marks the worker full even though it is only half of 2 CPUs', () => {
    const t = { cpu: 0, wall: 0 };
    const sampler = createCpuLoadSampler({
      cpuMicros: () => t.cpu,
      nowMicros: () => t.wall,
      cpus: 2,
      eventLoopBusy: () => 0.97,
    });
    let load = 0;
    for (let i = 0; i < 5; i++) {
      t.wall += 2_500_000;
      t.cpu += 2_500_000; // one thread busy = 50% of 2 CPUs
      load = sampler.sample();
    }
    expect(load).toBeGreaterThan(FULL_LOAD_THRESHOLD);
    expect(workerIsFull(1, load)).toBe(true);
  });
});

describe('workerIsFull', () => {
  it('is full under one call when the CPU is saturated (the dev SIGTERM case)', () => {
    expect(workerIsFull(1, 0.9)).toBe(true);
  });

  it('accepts calls while load is below the threshold and under the job cap', () => {
    expect(workerIsFull(2, 0.4)).toBe(false);
  });

  it('keeps the 3-job cap even when CPU is idle', () => {
    expect(workerIsFull(3, 0)).toBe(true);
  });
});
