import { describe, expect, it, vi } from 'vitest';
import {
  createEndCallTool,
  forgetOnBehalfCallRoom,
  registerOnBehalfCallRoom,
  takeCallDisposition,
} from '../call-control.js';

type EndCallTool = NonNullable<ReturnType<typeof createEndCallTool>>;

/** Run the tool the way the agent session does, with a RunContext stand-in. */
function run(
  tool: EndCallTool,
  outcome: string,
  waitForPlayout: () => Promise<void> = async () => undefined
) {
  const execute = (tool as unknown as { execute: (a: unknown, o: unknown) => Promise<string> })
    .execute;
  return execute({ outcome }, { ctx: { waitForPlayout }, toolCallId: 't1' });
}

describe('endCall', () => {
  it('only exists in on-behalf call sessions', () => {
    expect(createEndCallTool('s-ordinary', vi.fn())).toBeNull();
    registerOnBehalfCallRoom('s-call', 'call-1', 'onbehalf-call-1');
    expect(createEndCallTool('s-call', vi.fn())).not.toBeNull();
    forgetOnBehalfCallRoom('s-call');
    expect(createEndCallTool('s-call', vi.fn())).toBeNull();
  });

  it('lets the goodbye finish, then hangs up the call room and records how it ended', async () => {
    registerOnBehalfCallRoom('s-vm', 'call-vm', 'onbehalf-call-vm');
    const order: string[] = [];
    const hangUp = vi.fn(async (room: string) => {
      order.push(`hang up ${room}`);
    });
    const waitForPlayout = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20)); // the goodbye is still playing
      order.push('goodbye played');
    });

    const result = await run(
      createEndCallTool('s-vm', hangUp) as EndCallTool,
      'voicemail_left',
      waitForPlayout
    );

    expect(order).toEqual(['goodbye played', 'hang up onbehalf-call-vm']);
    expect(result).toBe('The call has ended.');
    expect(takeCallDisposition('call-vm')).toBe('voicemail_left');
    expect(takeCallDisposition('call-vm')).toBeUndefined(); // read once
  });

  it('still records the outcome and tells the model to go quiet when the hang-up fails', async () => {
    registerOnBehalfCallRoom('s-fail', 'call-fail', 'onbehalf-call-fail');
    const hangUp = vi.fn(async () => {
      throw new Error('livekit down');
    });
    const result = await run(createEndCallTool('s-fail', hangUp) as EndCallTool, 'completed');
    expect(result).toContain('Stay quiet');
    expect(takeCallDisposition('call-fail')).toBe('completed');
  });
});
