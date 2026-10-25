/**
 * A name inside a yes counts only when it leaves the action as read back (#2099 D).
 *
 * Before: isClearYes took any capitalised word after a comma as Ferni's name, so with a call to
 * Mike waiting, "Yes, go ahead, Bob." was a plain yes and Mike was dialled. Now the name must be
 * a persona's, a mishearing of Ferni's, the owner's first name or the person the action reaches.
 *
 * The gate cases drive the real withOutreachConfirmation wrapper around a stand-in tool, so a
 * send is observable as a call to the inner execute. No services are involved.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '../../../../registry/types.js';
import {
  isClearYes,
  outreachConfirmListeners,
  withOutreachConfirmation,
} from '../outreach-confirm.js';

const TO_MIKE = ['mike'];
const OWNER = ['seth'];

describe('isClearYes: the name in a yes', () => {
  it.each([
    ['Yes.', true],
    ['Yes, go ahead.', true],
    ['Yes, go ahead, Ferni.', true],
    ['Okay Maya, go ahead', true],
    // STT mishearings of "Ferni".
    ['Uh, go ahead, Fred.', true],
    ['Yes, go ahead, Freddie!', true],
    ['Fernie, go ahead.', true],
    ['Yes, Furny.', true],
    // The owner's own first name.
    ['Yes, go ahead, Seth.', true],
    ['Seth, go ahead.', true],
    // Naming the person being called restates the read-back.
    ['Yes, go ahead, Mike.', true],
    ['Mike, yes.', true],
    // Any other name voids the yes, wherever it sits.
    ['Yes, go ahead, Bob.', false],
    ['Bob, go ahead.', false],
    ['Okay Sam, go ahead', false],
    ['Yes, Dana.', false],
    // Unchanged refusals.
    ['Go ahead, call Bob instead', false],
    ['Go ahead Fred', false],
    ['Yes, Fred?', false],
    ['Yes, Mom.', false],
  ])('%s → %s (call to Mike, owner Seth)', (text, yes) => {
    expect(isClearYes(text, TO_MIKE, OWNER)).toBe(yes);
  });

  it('the target and the owner count only when given', () => {
    expect(isClearYes('Yes, go ahead, Mike.')).toBe(false);
    expect(isClearYes('Yes, go ahead, Seth.', TO_MIKE)).toBe(false);
    expect(isClearYes('Yes, go ahead, Mike.', ['bob'], OWNER)).toBe(false);
  });

  it('a relative is never the name, even when it is the target', () => {
    expect(isClearYes('Yes, Dad.', ['my', 'dad'], OWNER)).toBe(false);
  });
});

describe('the gate: a yes naming someone else sends nothing', () => {
  function gatedCall(userData?: Record<string, unknown>) {
    const send = vi.fn(async (_args: unknown) => 'Calling Mike now.');
    const def = {
      id: 'callOnBehalf',
      create: () => ({ execute: send }),
    } as unknown as ToolDefinition;
    const gated = withOutreachConfirmation(def, {
      prepare: async (args) => ({ args, readBack: 'a call to Mike at 555-0142' }),
    }).create({ userId: 'user-1', agentId: 'ferni', agentDisplayName: 'Ferni' });
    const session = { agentState: 'listening' };
    const listeners = outreachConfirmListeners(session, () => true);
    const call = async (callId: string) => {
      const run = { ctx: { session, userData }, toolCallId: callId };
      const out = await (
        gated as { execute: (a: unknown, o: unknown) => Promise<unknown> }
      ).execute({ contactName: 'Mike' }, run);
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    };
    const caller = (text: string) => listeners.onTranscript({ transcript: text, isFinal: true });
    return { send, call, caller };
  }

  it.each([
    ['Yes, go ahead, Bob.', 0],
    ['Yes, go ahead, Ferni.', 1],
    ['Uh, go ahead, Fred.', 1],
    ['Yes, go ahead, Mike.', 1],
    ['Yes, go ahead, Seth.', 1],
  ])('%s with a call to Mike waiting → %i sends', async (yes, sends) => {
    const call = gatedCall({ userName: 'Seth Ford' });
    expect(await call.call('c1')).toContain('NOT SENT YET');
    call.caller(yes);
    await call.call('c2');
    expect(call.send).toHaveBeenCalledTimes(sends);
  });

  it.each([
    ['Yes, go ahead, Bob.', 0],
    ['Yes, go ahead, Seth.', 1],
  ])('with OUTREACH_SERVER_CONFIRM on, %s → %i sends', async (yes, sends) => {
    vi.stubEnv('OUTREACH_SERVER_CONFIRM', 'on');
    try {
      const call = gatedCall({ userName: 'Seth Ford' });
      expect(await call.call('c1')).toContain('NOT SENT YET');
      call.caller(yes);
      await call.call('c2');
      expect(call.send).toHaveBeenCalledTimes(sends);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("the owner's name counts only when the call's user data gives it", async () => {
    const call = gatedCall();
    await call.call('c1');
    call.caller('Yes, go ahead, Seth.');
    expect(await call.call('c2')).toContain('NOT SENT YET');
    expect(call.send).not.toHaveBeenCalled();
  });
});
