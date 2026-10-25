/**
 * POST /api/jobs/waitlist-wave: off unless WAITLIST_WAVES=on, routed and
 * scheduler-authenticated like every job, and the wave id is the UTC date.
 */
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import type { WaveDeps } from '../../../services/waitlist/wave.js';
import { memoryStore } from '../../../services/waitlist/__tests__/memory-store.js';
import { memoryWaveStore } from '../../../services/waitlist/__tests__/memory-wave-store.js';
import { joinWaitlist } from '../../../services/waitlist/join.js';
import { JOB_PATHS } from '../index.js';
import { handleWaitlistWave, runWaitlistWaveJob } from '../waitlist-jobs.js';
import type { IncomingMessage, ServerResponse } from 'http';

const NOW = new Date('2026-10-22T17:00:00Z');

describe('waitlist-wave job', () => {
  it('does nothing while WAITLIST_WAVES is off (the default)', async () => {
    let built = false;
    const deps = async () => { built = true; return null; }; // prettier-ignore
    expect(await runWaitlistWaveJob({ dryRun: false, env: {}, deps })).toEqual({ skipped: 'flag-off' }); // prettier-ignore
    expect(built).toBe(false);
  });

  it('runs a wave named for the UTC date when on', async () => {
    const q = memoryStore();
    await joinWaitlist(q.store, { email: 'pat@example.com', verified: true, source: 't', now: new Date('2026-10-01') }); // prettier-ignore
    const w = memoryWaveStore(q.docs);
    const deps = async (now: Date, dryRun: boolean): Promise<WaveDeps> => ({
      store: w.store,
      guard: async () => ({ state: 'ok', costUsd: 1, costDay: null, errorRate: 0, reasons: [] }),
      now,
      dryRun,
    });
    const out = await runWaitlistWaveJob({ dryRun: false, env: { WAITLIST_WAVES: 'on' }, deps, now: NOW }); // prettier-ignore
    expect(out).toMatchObject({ waveId: '2026-10-22', wave: 1, admitted: 1 });
  });

  it('a bare POST is a dry run: it admits nobody', async () => {
    const q = memoryStore();
    await joinWaitlist(q.store, { email: 'pat@example.com', verified: true, source: 't', now: new Date('2026-10-01') }); // prettier-ignore
    const w = memoryWaveStore(q.docs);
    const seen: boolean[] = [];
    const run = (opts: { dryRun: boolean }) => {
      seen.push(opts.dryRun);
      return runWaitlistWaveJob({ ...opts, env: { WAITLIST_WAVES: 'on' }, now: NOW, deps: async (now, dryRun) => ({ store: w.store, guard: async () => ({ state: 'ok', costUsd: 1, costDay: null, errorRate: 0, reasons: [] }), now, dryRun }) }); // prettier-ignore
    };
    const res = { writeHead: () => undefined, end: () => undefined };
    await handleWaitlistWave({ url: '/api/jobs/waitlist-wave' } as IncomingMessage, res as unknown as ServerResponse, run); // prettier-ignore
    await handleWaitlistWave({ url: '/api/jobs/waitlist-wave?apply=true' } as IncomingMessage, res as unknown as ServerResponse, run); // prettier-ignore
    expect(seen).toEqual([true, false]);
  });

  it('a bare POST writes no wave and admits no one', async () => {
    const q = memoryStore();
    await joinWaitlist(q.store, { email: 'pat@example.com', verified: true, source: 't', now: new Date('2026-10-01') }); // prettier-ignore
    const w = memoryWaveStore(q.docs);
    const deps = async (now: Date, dryRun: boolean): Promise<WaveDeps> => ({ store: w.store, guard: async () => ({ state: 'ok', costUsd: 1, costDay: null, errorRate: 0, reasons: [] }), now, dryRun }); // prettier-ignore
    const res = { writeHead: () => undefined, end: () => undefined };
    await handleWaitlistWave({ url: '/api/jobs/waitlist-wave' } as IncomingMessage, res as unknown as ServerResponse, (opts) => runWaitlistWaveJob({ ...opts, env: { WAITLIST_WAVES: 'on' }, now: NOW, deps })); // prettier-ignore
    expect(w.waves.size).toBe(0);
    expect([...q.docs.values()].some((d) => d.status === 'admitted')).toBe(false);
  });

  it('a failure answers 500 with a generic error, never the exception text', async () => {
    let status = 0;
    let body = '';
    const res = {
      writeHead: (s: number) => void (status = s),
      end: (b: string) => void (body = b),
    };
    const boom = async () => { throw new Error('PERMISSION_DENIED projects/secret-billing-thing'); }; // prettier-ignore
    await handleWaitlistWave({ url: '/api/jobs/waitlist-wave' } as never, res as never, boom);
    expect(status).toBe(500);
    expect(body).not.toContain('PERMISSION_DENIED');
    expect(JSON.parse(body)).toEqual({
      success: false,
      job: 'waitlist-wave',
      error: 'wave_failed',
    });
  });

  it('is a routed job path, and the scheduler definition matches Mon/Thu 17:00 UTC', () => {
    expect(JOB_PATHS.has('/api/jobs/waitlist-wave')).toBe(true);
    const yaml = readFileSync('infra/cloud-scheduler-delivery.yaml', 'utf8');
    expect(yaml).toMatch(
      /name: waitlist-wave[\s\S]*?schedule: "0 17 \* \* 1,4"\n\s+timeZone: Etc\/UTC/
    );
  });
});
