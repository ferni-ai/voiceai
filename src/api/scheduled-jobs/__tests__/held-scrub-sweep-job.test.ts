/**
 * POST /api/jobs/held-scrub-sweep: the MINOR_CARE sweep of failed held-window scrubs. Off unless
 * HELD_SCRUB_SWEEP=on; when on it loads the purge module first (it registers every store's scrub,
 * as a session start has them) and passes ?scan=all&after= through. A scheduler job path, so the
 * OIDC check guards it, and the scheduler config (CLI source + infra yaml) lists it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ order: [] as string[], opts: [] as unknown[] }));
vi.mock('../../../agents/voice-agent/minor-care-purge.js', () => {
  calls.order.push('purge module');
  return {};
});
vi.mock('../../../services/trust-systems/held-scrub-sweep.js', () => ({
  sweepHeldScrubs: vi.fn(async (opts: unknown) => {
    calls.order.push('sweep');
    calls.opts.push(opts);
    return { read: 2, retried: 1, scrubbed: 1, failed: 0 };
  }),
}));

import { handleHeldScrubSweep, runHeldScrubSweepJob } from '../background-delivery-jobs.js';
import { JOB_PATHS, handleScheduledJobsRoutes } from '../index.js';

const res = () => {
  const end = vi.fn();
  return { end, res: { writeHead: vi.fn(), setHeader: vi.fn(), end } as unknown as ServerResponse };
};

afterEach(() => {
  calls.order.length = 0;
  calls.opts.length = 0;
  vi.unstubAllEnvs();
});

describe('held-scrub-sweep job', () => {
  it('off by default: runs nothing', async () => {
    expect(await runHeldScrubSweepJob({ env: {} })).toEqual({ skipped: 'flag-off' });
    expect(calls.order).toEqual([]);
  });

  it('on: registers the purge scrubs first, then sweeps, and answers the counts', async () => {
    vi.stubEnv('HELD_SCRUB_SWEEP', 'on');
    const { end, res: r } = res();
    const req = { url: '/api/jobs/held-scrub-sweep?scan=all&after=abc' } as IncomingMessage;
    await handleHeldScrubSweep(req, r);
    expect(calls.order).toEqual(['purge module', 'sweep']);
    expect(calls.opts).toEqual([{ scanAll: true, after: 'abc' }]);
    expect(JSON.parse(end.mock.calls[0][0] as string)).toMatchObject({
      success: true,
      job: 'held-scrub-sweep',
      retried: 1,
      scrubbed: 1,
    });
  });

  it('is a scheduler job path and refuses a POST without the OIDC token (401)', async () => {
    vi.stubEnv('HELD_SCRUB_SWEEP', 'on');
    expect(JOB_PATHS.has('/api/jobs/held-scrub-sweep')).toBe(true);
    const writeHead = vi.fn();
    const r = { writeHead, setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
    const req = { method: 'POST', headers: {} } as unknown as IncomingMessage;
    expect(await handleScheduledJobsRoutes(req, r, '/api/jobs/held-scrub-sweep')).toBe(true);
    expect(writeHead.mock.calls[0]?.[0]).toBe(401);
    expect(calls.order).toEqual([]);
  });

  it('the scheduler config lists it hourly, in the CLI source and the infra yaml', () => {
    const root = join(__dirname, '../../../..');
    const cli = readFileSync(join(root, 'apps/cli/src/commands/ops/delivery-jobs.ts'), 'utf8');
    expect(cli).toMatch(/name: 'held-scrub-sweep',[\s\S]{0,200}schedule: '17 \* \* \* \*'/);
    expect(cli).toContain('`${uiServerUrl}/api/jobs/held-scrub-sweep`');
    const yaml = readFileSync(join(root, 'infra/cloud-scheduler-delivery.yaml'), 'utf8');
    expect(yaml).toContain('audience: https://app.ferni.ai/api/jobs/held-scrub-sweep');
  });
});
