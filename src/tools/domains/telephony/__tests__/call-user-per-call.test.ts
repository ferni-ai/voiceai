/**
 * callUser per call:
 *
 * - The honest refusal is said once per call. On prod a caller who kept
 *   asking heard "I can't ring your phone from here yet…" five times in a row;
 *   after the first, the tool tells the model it already said so. A new call
 *   (a new session userData) hears it again.
 * - TOOLS_REAL_CALL_USER is read when the tool runs. The definitions are built
 *   once, when the domain module is imported, before any caller is known, so a
 *   per-person cohort flag applied at call start used to come too late.
 * - The real path rings only the verified phone, never a number in the arguments.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyCallerFlags,
  COHORT_FLAGS,
  forgetAgentValues,
  resolveCallerFlags,
  type CohortStore,
} from '../../../../services/platform/cohort-flags.js';
import { setCallUserPort } from '../../proactive/outreach/call-user-port.js';
import { definitions } from '../index.js';
import {
  ALREADY_SAID_CANT_CALL,
  ALREADY_SAID_CANT_SCHEDULE,
  CANT_CALL_NOW,
  CANT_SCHEDULE_CALL,
} from '../telephony.js';
import type { ToolContext } from '../../../registry/types.js';

type Executable = { execute: (args: Record<string, unknown>, o: unknown) => Promise<string> };

const VERIFIED = '+15551230000';
const SUPPLIED = { phoneNumber: '+19005550100', to: '+19005550100', phone: '+19005550100' };

/** A run inside one call: the SDK hands every tool the session's userData. */
const inCall = (userData: object) => ({ toolCallId: 't', ctx: { userData } });

/** Built at import, as in a worker: before any caller's flags were applied. */
function tool(id: string, as: { userId?: string } = {}): Executable {
  const def = definitions.find((d) => d.id === id)!;
  const ctx: ToolContext = { agentId: 'ferni', agentDisplayName: 'Ferni', userId: as.userId ?? '' };
  return def.create(ctx) as Executable;
}

const outreach = { verifiedPhone: vi.fn(), call: vi.fn() };

beforeEach(() => {
  vi.stubEnv('TOOLS_REAL_CALL_USER', undefined as unknown as string);
  forgetAgentValues();
});
afterEach(() => {
  vi.clearAllMocks();
  setCallUserPort(undefined);
  vi.unstubAllEnvs();
  forgetAgentValues();
});

describe('the refusal is said once per call', () => {
  it('callUser: the full refusal first, then a short note, for the rest of the call', async () => {
    const call = inCall({ userId: 'u1' });
    const callUser = tool('callUser');
    expect(await callUser.execute({ reason: 'check in' }, call)).toBe(CANT_CALL_NOW);
    expect(await callUser.execute({ reason: 'check in' }, call)).toBe(ALREADY_SAID_CANT_CALL);
    expect(await callUser.execute({ reason: 'please' }, call)).toBe(ALREADY_SAID_CANT_CALL);
    expect(ALREADY_SAID_CANT_CALL).toMatch(/don't repeat that offer/i);
    expect(ALREADY_SAID_CANT_CALL).not.toMatch(/want me to\?/i);
  });

  it('callUser: a new call hears the refusal again', async () => {
    const callUser = tool('callUser');
    const first = inCall({ userId: 'u1' });
    await callUser.execute({ reason: 'check in' }, first);
    expect(await callUser.execute({ reason: 'check in' }, first)).toBe(ALREADY_SAID_CANT_CALL);
    expect(await callUser.execute({ reason: 'check in' }, inCall({ userId: 'u1' }))).toBe(
      CANT_CALL_NOW
    );
  });

  it('scheduleCallback: the same, once per call', async () => {
    const schedule = tool('scheduleCallback');
    const call = inCall({ userId: 'u1' });
    const args = { when: 'at 5', reason: 'check in' };
    expect(await schedule.execute(args, call)).toBe(CANT_SCHEDULE_CALL);
    expect(await schedule.execute(args, call)).toBe(ALREADY_SAID_CANT_SCHEDULE);
    expect(await schedule.execute(args, inCall({ userId: 'u1' }))).toBe(CANT_SCHEDULE_CALL);
  });

  it('a session with no userData (the SDK throws) still gets the full refusal', async () => {
    const noData = {
      toolCallId: 't',
      ctx: {
        get userData(): never {
          throw new Error('Voice agent userData is not set');
        },
      },
    };
    const callUser = tool('callUser');
    expect(await callUser.execute({ reason: 'x' }, noData)).toBe(CANT_CALL_NOW);
    expect(await callUser.execute({ reason: 'x' }, noData)).toBe(CANT_CALL_NOW);
  });
});

describe('TOOLS_REAL_CALL_USER per person', () => {
  const store = (flags: Record<string, Record<string, string>>): CohortStore => ({
    cohortsFor: async () => [],
    overridesFor: async (uid) => flags[uid] ?? {},
  });
  const seth = store({ seth: { TOOLS_REAL_CALL_USER: 'on' } });

  beforeEach(() => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    vi.stubEnv('AGENT_MAX_JOBS_PER_WORKER', '1');
    setCallUserPort(outreach);
    outreach.verifiedPhone.mockResolvedValue(VERIFIED);
    outreach.call.mockResolvedValue({ success: true, status: 'initiated' });
  });

  it('the allowlist lets a cohort or an override set it', async () => {
    expect(COHORT_FLAGS).toContain('TOOLS_REAL_CALL_USER');
    expect(await resolveCallerFlags('seth', seth)).toEqual({ TOOLS_REAL_CALL_USER: 'on' });
  });

  it('flag on for this caller: the already-built tool places a real call to the verified phone', async () => {
    const callUser = tool('callUser', { userId: 'seth' }); // built before the caller's flags apply
    expect(await applyCallerFlags('seth', { store: seth })).toEqual(['TOOLS_REAL_CALL_USER']);
    const reply = await callUser.execute(
      { reason: 'check in', message: 'hey, checking in', ...SUPPLIED },
      inCall({ userId: 'seth', verifiedCaller: true })
    );
    expect(reply).toBe('Calling you now.');
    expect(outreach.verifiedPhone).toHaveBeenCalledWith('seth');
    expect(outreach.call).toHaveBeenCalledTimes(1);
    expect(outreach.call).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'seth',
        phoneNumber: VERIFIED,
        message: 'hey, checking in',
      })
    );
  });

  it('the next caller without the flag gets the honest refusal, and no call', async () => {
    await applyCallerFlags('seth', { store: seth });
    await applyCallerFlags('someone-else', { store: seth });
    const reply = await tool('callUser', { userId: 'someone-else' }).execute(
      { reason: 'check in' },
      inCall({ userId: 'someone-else' })
    );
    expect(reply).toBe(CANT_CALL_NOW);
    expect(outreach.call).not.toHaveBeenCalled();
  });

  it('a number the model supplies is never dialed', async () => {
    await applyCallerFlags('seth', { store: seth });
    const callUser = tool('callUser', { userId: 'seth' });
    await callUser.execute(
      { reason: 'call me', ...SUPPLIED },
      inCall({ userId: 'seth', verifiedCaller: true })
    );
    const dialed = outreach.call.mock.calls.map(
      (c) => (c[0] as { phoneNumber: string }).phoneNumber
    );
    expect(dialed).toEqual([VERIFIED]);

    // No verified phone: nothing is placed, whatever number the arguments carry.
    outreach.call.mockClear();
    outreach.verifiedPhone.mockResolvedValue(undefined);
    const reply = await callUser.execute(
      { reason: 'call me', ...SUPPLIED },
      inCall({ userId: 'seth', verifiedCaller: true })
    );
    expect(outreach.call).not.toHaveBeenCalled();
    expect(reply).toMatch(/no verified phone/);
  });
});
