/**
 * There is one callUser. The telephony stub and the proactive outreach tool
 * both used the id, and the registry keeps whichever registers last, so the
 * call path depended on domain load order. Telephony now owns the id: the
 * real call path behind TOOLS_REAL_CALL_USER=on, the honest stub otherwise.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const outreach = vi.hoisted(() => ({
  userReach: vi.fn(),
  scheduleProactiveCall: vi.fn(),
}));
vi.mock('../../../../services/outreach/user-reach.js', () => ({ userReach: outreach.userReach }));
vi.mock('../../../../services/outreach/conversational-calls.js', () => ({
  scheduleProactiveCall: outreach.scheduleProactiveCall,
}));

import { getToolDefinitions as getProactiveDefinitions } from '../../proactive/index.js';
import { getTelephonyToolDefinitions } from '../index.js';
import { CANT_CALL_NOW } from '../telephony.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';

const ctx = { agentId: 'ferni', agentDisplayName: 'Ferni' } as ToolContext;
const opts = { toolCallId: 'test-call-id', ctx: {} as never };

type Executable = { execute: (args: Record<string, string>, o: typeof opts) => Promise<string> };

function callUserFrom(definitions: ToolDefinition[]): ToolDefinition[] {
  return definitions.filter((d) => d.id === 'callUser');
}

async function runCallUser(definition: ToolDefinition, as: ToolContext = ctx): Promise<string> {
  const tool = definition.create(as) as unknown as Executable;
  return tool.execute({ reason: 'check in', message: 'hi' }, opts);
}

const original = process.env.TOOLS_REAL_CALL_USER;
afterEach(() => {
  vi.clearAllMocks();
  if (original === undefined) delete process.env.TOOLS_REAL_CALL_USER;
  else process.env.TOOLS_REAL_CALL_USER = original;
});

describe('callUser has one definition', () => {
  it('the proactive domain no longer registers callUser', async () => {
    expect(callUserFrom(await getProactiveDefinitions())).toEqual([]);
  });

  it('telephony registers exactly one callUser, in its own domain', () => {
    const defs = callUserFrom(getTelephonyToolDefinitions());
    expect(defs).toHaveLength(1);
    expect(defs[0].domain).toBe('telephony');
  });

  it('flag off: callUser says honestly that no call is coming', async () => {
    delete process.env.TOOLS_REAL_CALL_USER;
    const [def] = callUserFrom(getTelephonyToolDefinitions());
    expect(await runCallUser(def)).toBe(CANT_CALL_NOW);
  });

  it('flag on: callUser is the real call path', async () => {
    process.env.TOOLS_REAL_CALL_USER = 'on';
    const [def] = callUserFrom(getTelephonyToolDefinitions());
    expect(def.domain).toBe('telephony');
    // The real tool needs a user before it can look up a number; the stub never asks.
    const result = await runCallUser(def);
    expect(result).not.toBe(CANT_CALL_NOW);
    expect(result).toBe("I'd need to know who you are to call you.");
  });

  describe('flag on: who gets called', () => {
    const user = { ...ctx, userId: 'u1' } as ToolContext;

    it('without a verified phone, no call is placed and it says so', async () => {
      process.env.TOOLS_REAL_CALL_USER = 'on';
      outreach.userReach.mockResolvedValue({ reason: 'no_verified_phone' });
      const [def] = callUserFrom(getTelephonyToolDefinitions());
      const reply = await runCallUser(def, user);
      expect(outreach.userReach).toHaveBeenCalledWith('u1', 'voice_call', { standingOptIn: false });
      expect(outreach.scheduleProactiveCall).not.toHaveBeenCalled();
      expect(reply).toMatch(/no call is coming/);
    });

    it('rings only the verified phone, through the calling-hours path', async () => {
      process.env.TOOLS_REAL_CALL_USER = 'on';
      outreach.userReach.mockResolvedValue({ phone: '+15551230000' });
      outreach.scheduleProactiveCall.mockResolvedValue({ success: true, status: 'scheduled' });
      const [def] = callUserFrom(getTelephonyToolDefinitions());
      const reply = await runCallUser(def, user);
      expect(outreach.scheduleProactiveCall).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', phoneNumber: '+15551230000', message: 'hi' })
      );
      expect(reply).toMatch(/outside your calling hours/);
    });
  });
});
