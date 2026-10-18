/**
 * The per-minute execute-scheduled-outreach job places the calls the agent's
 * call-hours guard deferred, whatever this server's own CALL_HOURS_GUARD says.
 * Prod 2026-10-17: the guard was on for the agent only, so a call the caller
 * confirmed ("held until 9:00") stayed pending forever.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const executeDueDeferredCalls = vi.hoisted(() =>
  vi.fn(async () => ({ due: 1, placed: 1, failed: 0, missed: 0 }))
);
vi.mock('../../../services/outreach/deferred-calls.js', () => ({ executeDueDeferredCalls }));
vi.mock('../../../services/outreach/scheduled-outreach-executor.js', () => ({
  executeDueScheduledOutreach: vi.fn(async () => ({ due: 0, sent: 0 })),
}));

import { handleExecuteScheduledOutreach } from '../background-delivery-jobs.js';

const req = (url: string): IncomingMessage => ({ url, headers: {} }) as unknown as IncomingMessage;
const res = (): ServerResponse =>
  ({
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn(),
    headersSent: false,
    statusCode: 200,
  }) as unknown as ServerResponse;

afterEach(() => {
  vi.unstubAllEnvs();
  executeDueDeferredCalls.mockClear();
});

describe('execute-scheduled-outreach places deferred calls', () => {
  it('runs them when this server has no CALL_HOURS_GUARD', async () => {
    vi.stubEnv('CALL_HOURS_GUARD', '');
    await handleExecuteScheduledOutreach(req('/api/jobs/execute-scheduled-outreach'), res());
    expect(executeDueDeferredCalls).toHaveBeenCalledTimes(1);
  });

  it('never places anything on a dry run', async () => {
    vi.stubEnv('CALL_HOURS_GUARD', 'on');
    await handleExecuteScheduledOutreach(
      req('/api/jobs/execute-scheduled-outreach?dryRun=true'),
      res()
    );
    expect(executeDueDeferredCalls).not.toHaveBeenCalled();
  });
});
