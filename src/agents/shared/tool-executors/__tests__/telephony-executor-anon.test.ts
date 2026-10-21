/**
 * The telephony executor refuses a caller with no account (an anon: session)
 * before it builds or runs a tool that reaches someone else, so no contact is
 * looked up or saved from a number they say. The owner's calls still run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.hoisted(() => ({ execute: vi.fn(async () => 'Calling now') }));
vi.mock('../../../../tools/domains/telephony/call-on-behalf.js', () => ({
  createCallOnBehalfTool: () => ({ execute: callTool.execute }),
}));
vi.mock('../../../../services/outreach/on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({}),
}));

import { NO_ACCOUNT_REFUSAL } from '../../../../tools/registry/outbound-gate.js';
import { telephonyExecutor } from '../telephony-executor.js';

const CALL = { contactQuery: 'my buddy', phoneNumber: '8015550142', purpose: 'say hi' };

describe('telephony executor, caller with no account', () => {
  beforeEach(() => vi.stubEnv('OUTBOUND_CONFIRM', 'off')); // the identity check needs no confirm gate
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each(['callOnBehalf', 'call_make', 'reachOut', 'multiOutreach'])(
    '%s is refused for an anon: session and runs nothing',
    async (fn) => {
      const out = await telephonyExecutor.execute(fn, CALL, {
        userId: 'anon:4f1c',
        sessionId: 's-anon',
        personaId: 'ferni',
      });
      expect(out).toBe(NO_ACCOUNT_REFUSAL);
      expect(callTool.execute).not.toHaveBeenCalled();
    }
  );

  it('is refused with no user id at all', async () => {
    expect(await telephonyExecutor.execute('callOnBehalf', CALL, { sessionId: 's' })).toBe(
      NO_ACCOUNT_REFUSAL
    );
    expect(callTool.execute).not.toHaveBeenCalled();
  });

  it('runs for the account owner, as before', async () => {
    const out = await telephonyExecutor.execute('callOnBehalf', CALL, {
      userId: 'user-1',
      sessionId: 's-owner',
      personaId: 'ferni',
    });
    expect(out).toBe('Calling now');
    expect(callTool.execute).toHaveBeenCalledTimes(1);
  });
});
