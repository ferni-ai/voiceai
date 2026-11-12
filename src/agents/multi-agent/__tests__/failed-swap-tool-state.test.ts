/**
 * A swap that fails after the handoff tool was told it worked must not leave the tools
 * thinking the teammate is on the call.
 *
 * With one session per call the tool is told the handoff worked once the next persona is
 * built (llm-handoff.ts), and the SDK swaps after the tool call ends. When that swap is
 * dropped, the call stays with the outgoing persona. The real executor and the real swap
 * handler are joined here, with fictional calls.
 */
import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handoffEvents } from '../../../handoff/index.js';
import {
  executeHandoff,
  getCurrentAgent,
  getHandoffHistory,
  resetHandoffState,
  setCurrentAgent,
} from '../../../tools/handoff/executor.js';
import {
  getCurrentAgent as sessionAgent,
  getSessionState,
} from '../../../tools/handoff/session-state.js';
import { recordHandoff, takeBackHandoff } from '../../../tools/handoff/state.js';
import { runLlmHandoff, type LlmHandoffCall, type VoiceSwitchEvent } from '../llm-handoff.js';

// A new call per test: the tools keep one record per call
let calls = 0;
let CALL = '';
const open = () => ({ sessionId: CALL, skipUnlockCheck: true, skipRateLimit: true });

/**
 * A call with Ferni on it, where the SDK drops the swap for every persona in `dropped`. For
 * a persona in `failsLate` the swap goes through and a later step (the greeting) fails.
 */
function callWhereSwapsDrop(dropped: string[], failsLate: string[] = []) {
  let current = 'ferni';
  const parts = {
    orchestrator: { getCurrentPersonaId: () => current },
    services: { sessionId: CALL },
    lock: { acquire: async () => true, release: () => undefined },
    publish: async () => undefined,
    runHandoff: vi.fn(
      async (
        _o: unknown,
        target: string,
        _r: string,
        _s: unknown,
        onReady: (a: unknown) => void
      ) => {
        onReady(new voice.Agent({ instructions: 'The next persona.' })); // the tool is told it worked
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 5); // the tool returns; the SDK's swap would follow
        });
        if (dropped.includes(target)) {
          return { success: false, error: "The handoff tool didn't swap within 8000ms" };
        }
        current = target;
        if (failsLate.includes(target)) return { success: false, error: 'The greeting failed' };
        return { success: true };
      }
    ),
  } as unknown as LlmHandoffCall;
  // Every swap this call started, so a test can wait for them all to finish
  const swaps: Array<Promise<void>> = [];
  handoffEvents.on('voiceSwitch', (event: VoiceSwitchEvent) => {
    swaps.push(runLlmHandoff(parts, event));
  });
  return { settled: async () => void (await Promise.all(swaps)), onCall: () => current };
}

beforeEach(() => {
  resetHandoffState();
  calls += 1;
  CALL = `call-dropped-swap-${calls}`;
});

afterEach(() => {
  handoffEvents.removeAllListeners('voiceSwitch');
  handoffEvents.removeAllListeners('handoffHandlerComplete');
});

describe('a swap that is dropped after the handoff tool was told it worked', () => {
  it('leaves the tools naming the persona still on the call', async () => {
    const call = callWhereSwapsDrop(['alex-chen']);
    getSessionState(CALL);

    const first = await executeHandoff('alex-chen', 'Their to-do list', open());
    await call.settled();

    expect(first.success).toBe(true); // the tool had already returned
    expect(call.onCall()).toBe('ferni');
    expect(getCurrentAgent()).toBe('ferni');
    expect(sessionAgent(getSessionState(CALL))).toBe('ferni');
  });

  it('lets the caller ask for the same teammate again', async () => {
    const call = callWhereSwapsDrop(['alex-chen']);
    await executeHandoff('alex-chen', 'Their to-do list', open());
    await call.settled();

    const again = await executeHandoff('alex-chen', 'Asked again', open());
    await call.settled();

    expect(again.error ?? '').not.toContain('Already with');
    expect(again.success).toBe(true); // it ran: the next persona was built again
  });

  it('takes the handoff that never happened back out of the history', async () => {
    const call = callWhereSwapsDrop(['alex-chen']);
    await executeHandoff('alex-chen', 'Their to-do list', open());
    await call.settled();

    expect(getHandoffHistory()).toHaveLength(0);
  });

  it('leaves the tools alone when someone else came on in the meantime', async () => {
    const call = callWhereSwapsDrop(['alex-chen']);
    await executeHandoff('alex-chen', 'Their to-do list', open());
    setCurrentAgent('maya-santos'); // as a tap to Maya does (multi-agent-entry.ts)
    await call.settled();

    expect(getCurrentAgent()).toBe('maya-santos');
    expect(getHandoffHistory()).toHaveLength(1);
  });

  it('after a real handoff to Maya, goes back to Maya and keeps that handoff', async () => {
    const call = callWhereSwapsDrop(['alex-chen']);
    await executeHandoff('maya-santos', 'Habits', open());
    await call.settled();
    expect(call.onCall()).toBe('maya-santos');

    await executeHandoff('alex-chen', 'Their to-do list', open());
    await call.settled();

    expect(getCurrentAgent()).toBe('maya-santos');
    expect(getHandoffHistory().map((h) => h.to)).toEqual(['maya-santos']);
  });

  it('leaves the tools alone when the swap went through and a later step failed', async () => {
    const call = callWhereSwapsDrop([], ['alex-chen']);
    await executeHandoff('alex-chen', 'Their to-do list', open());
    await call.settled();

    expect(call.onCall()).toBe('alex-chen'); // the teammate is on the call
    expect(getCurrentAgent()).toBe('alex-chen');
    expect(getHandoffHistory()).toHaveLength(1);
  });

  it('only ever takes back a handoff to that teammate', () => {
    recordHandoff('ferni', 'maya-santos', 'Habits');

    takeBackHandoff('alex-chen');
    expect(getHandoffHistory()).toHaveLength(1);

    takeBackHandoff('maya-santos');
    expect(getHandoffHistory()).toHaveLength(0);
  });

  it('a swap that goes through still names the teammate (guard)', async () => {
    const call = callWhereSwapsDrop([]);
    await executeHandoff('alex-chen', 'Their to-do list', open());
    await call.settled();

    expect(call.onCall()).toBe('alex-chen');
    expect(getCurrentAgent()).toBe('alex-chen');
    expect(getHandoffHistory()).toHaveLength(1);
  });
});
