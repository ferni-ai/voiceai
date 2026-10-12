import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFirstReplyGate,
  FIRST_TURN_HOLD_CAP_MS,
  firstTurnCalmEnabled,
  markTurnPipelineWarm,
  resetTurnPipelineWarm,
} from '../first-turn-calm.js';
import { createTurnContextPusher } from '../turn-intelligence.js';

const makeAgent = () => {
  let ctx = llm.ChatContext.empty();
  return {
    get chatCtx() {
      return ctx;
    },
    updateChatCtx: vi.fn(async (next: llm.ChatContext) => {
      ctx = next;
    }),
  };
};

/** A turn hook that records the words it ran for. */
const recordingHook = () => {
  const ran: string[] = [];
  const hook = vi.fn(async (turnCtx: llm.ChatContext, message: llm.ChatMessage) => {
    ran.push(message.textContent ?? '');
    turnCtx.addMessage({ role: 'user', content: '[CONTEXT: note]' });
  });
  return { hook, ran };
};

const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

beforeEach(() => resetTurnPipelineWarm());
afterEach(() => {
  vi.useRealTimers();
  delete process.env.FIRST_TURN_CALM;
});

describe('first turn calm', () => {
  it('is off unless FIRST_TURN_CALM is on', () => {
    expect(firstTurnCalmEnabled({})).toBe(false);
    expect(firstTurnCalmEnabled({ FIRST_TURN_CALM: 'on' })).toBe(true);
  });

  it('starts the first turn’s work only once the reply to it is audible', async () => {
    const { hook, ran } = recordingHook();
    const pusher = createTurnContextPusher(
      hook,
      makeAgent(),
      createFirstReplyGate({ enabled: true, settleMs: 20 })
    );

    await pusher.onAgentState('speaking'); // the greeting
    await pusher.onAgentState('listening');
    const turn = pusher.onFinalTranscript("it's been a long day");
    await pusher.onAgentState('thinking');
    await settle();
    expect(ran).toEqual([]); // held while the caller waits for the reply

    await pusher.onAgentState('speaking'); // the reply is audible
    await settle();
    expect(ran).toEqual([]); // its audio is still queueing up
    await turn; // released FIRST_REPLY_SETTLE_MS (here 20 ms) later

    expect(ran).toEqual(["it's been a long day"]);
  });

  it('runs every turn at once when off', async () => {
    const { hook, ran } = recordingHook();
    const pusher = createTurnContextPusher(
      hook,
      makeAgent(),
      createFirstReplyGate({ enabled: false })
    );
    await pusher.onFinalTranscript('hi there');
    expect(ran).toEqual(['hi there']);
  });

  it('never holds a later turn, and gives up waiting after the cap', async () => {
    vi.useFakeTimers();
    const { hook, ran } = recordingHook();
    const pusher = createTurnContextPusher(
      hook,
      makeAgent(),
      createFirstReplyGate({ enabled: true })
    );
    const first = pusher.onFinalTranscript('hello?');
    await vi.advanceTimersByTimeAsync(FIRST_TURN_HOLD_CAP_MS - 1);
    expect(ran).toEqual([]);
    await vi.advanceTimersByTimeAsync(1); // no reply came: run anyway
    await first;
    expect(ran).toEqual(['hello?']);

    await pusher.onAgentState('speaking'); // the reply to the first turn, then the next turn
    await pusher.onAgentState('listening');
    await pusher.onFinalTranscript('second turn');
    expect(ran).toEqual(['hello?', 'second turn']);
  });

  it('holds only a process’s first call: once the pipeline has run, calls start warm', async () => {
    process.env.FIRST_TURN_CALM = 'on';
    const firstCall = recordingHook();
    const pusherA = createTurnContextPusher(
      firstCall.hook,
      makeAgent(),
      createFirstReplyGate({ settleMs: 0 })
    );
    const held = pusherA.onFinalTranscript('first caller');
    await settle();
    expect(firstCall.ran).toEqual([]);
    await pusherA.onAgentState('speaking');
    await held;
    expect(firstCall.ran).toEqual(['first caller']);

    const laterCall = recordingHook();
    const pusherB = createTurnContextPusher(laterCall.hook, makeAgent());
    await pusherB.onFinalTranscript('second caller');
    expect(laterCall.ran).toEqual(['second caller']);
  });

  it('a warm process is not held even with the flag on', async () => {
    process.env.FIRST_TURN_CALM = 'on';
    const cold = createFirstReplyGate({ capMs: 10_000 });
    markTurnPipelineWarm();
    const warm = createFirstReplyGate({ capMs: 10_000 });
    let coldDone = false;
    void cold.ready().then(() => (coldDone = true));
    let done = false;
    void warm.ready().then(() => (done = true));
    await settle();
    expect(done).toBe(true);
    expect(coldDone).toBe(false); // made before the pipeline ran: still held
    cold.onAgentState('speaking');
  });
});
