/**
 * The empty-response watchdog must not fire on a healthy tool turn (LLM pass,
 * tool fetch, second pass: first audio at 3.5-6 s on 2026-10-04's weather
 * calls), and must still fire when a turn really gets no reply.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream, WritableStream } from 'node:stream/web';

import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_RESPONSE_WATCHDOG_MS } from '../../../config/timeouts.js';
import { diag } from '../../../services/diagnostic-logger.js';
import { tapToolCalls } from '../../personas/turn-request.js';
import { createEmptyResponseWatchdog } from '../empty-response-watchdog.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

const TIMEOUT = 3000;
const HOLD = 15_000;

function watchdog() {
  const onTimeout = vi.fn();
  return {
    dog: createEmptyResponseWatchdog({ timeoutMs: TIMEOUT, toolHoldMs: HOLD, onTimeout }),
    onTimeout,
  };
}

describe('createEmptyResponseWatchdog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a 2.5 s tool call with the reply 2 s after it does not trigger recovery', () => {
    const { dog, onTimeout } = watchdog();
    dog.arm(); // user stopped
    vi.advanceTimersByTime(800); // first LLM pass asks for the tool
    dog.toolsStarted();
    vi.advanceTimersByTime(2500); // t=3.3 s: past the bare 3 s deadline, tool still running
    dog.toolsExecuted();
    vi.advanceTimersByTime(2000); // t=5.3 s: second pass starts speaking
    expect(onTimeout).not.toHaveBeenCalled();
    dog.cancel();
    vi.advanceTimersByTime(HOLD * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('no reply for 3 s after the tool results come back does trigger recovery', () => {
    const { dog, onTimeout } = watchdog();
    dog.arm();
    vi.advanceTimersByTime(800);
    dog.toolsStarted();
    vi.advanceTimersByTime(2500);
    dog.toolsExecuted();
    vi.advanceTimersByTime(TIMEOUT - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(dog.armed).toBe(false);
  });

  it('a turn with no tool call and no reply fires at the 3 s deadline', () => {
    const { dog, onTimeout } = watchdog();
    dog.arm();
    vi.advanceTimersByTime(TIMEOUT - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('a tool that never returns fires at the hold cap, not never', () => {
    const { dog, onTimeout } = watchdog();
    dog.arm();
    dog.toolsStarted();
    vi.advanceTimersByTime(HOLD - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('a tool requested before the user-stopped event still holds the clock', () => {
    const { dog, onTimeout } = watchdog();
    dog.toolsStarted(); // preemptive reply asked for the tool first
    dog.arm();
    vi.advanceTimersByTime(TIMEOUT + 1500); // tool still running past 3 s
    expect(onTimeout).not.toHaveBeenCalled();
    dog.toolsExecuted();
    vi.advanceTimersByTime(TIMEOUT);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('a short "mm-hm" during a tool call does not drop the hold', () => {
    const { dog, onTimeout } = watchdog();
    dog.arm();
    dog.toolsStarted();
    vi.advanceTimersByTime(1000);
    dog.cancel(); // user speaks
    dog.arm(); // and stops
    vi.advanceTimersByTime(TIMEOUT + 1000); // tool still running
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('after the agent replies, a later turn starts a plain 3 s clock', () => {
    const { dog, onTimeout } = watchdog();
    dog.toolsStarted(); // a discarded preemptive reply's tool, never executed
    dog.reset(); // the agent spoke
    dog.arm();
    vi.advanceTimersByTime(TIMEOUT);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('tool events with no turn waiting start no clock', () => {
    const { dog, onTimeout } = watchdog();
    dog.toolsStarted();
    dog.toolsExecuted();
    vi.advanceTimersByTime(HOLD * 2);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(dog.armed).toBe(false);
  });
});

describe('session-state-handler: watchdog wiring', () => {
  const SID = 'empty-response-watchdog-wiring';

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup() {
    const session = Object.assign(new EventEmitter(), { interrupt: vi.fn() });
    const states = vi.spyOn(diag, 'state');
    const result = setupSessionStateHandlers({
      session,
      sessionPersona: { id: 'ferni', name: 'Ferni' },
      conversationManager: {
        isAgentSpeaking: () => false,
        handleUserFinishedSpeaking: vi.fn(),
        handleAgentStartedSpeaking: vi.fn(),
      },
      userData: {},
      sessionId: SID,
    } as unknown as SessionStateContext);
    const emit = (type: string, event: object) => {
      try {
        session.emit(type, event);
      } catch {
        // Later, unrelated work in the handlers may need a live session; not under test.
      }
    };
    const watchdogLogs = () =>
      states.mock.calls.filter(([msg]) => String(msg).includes('EMPTY_RESPONSE_WATCHDOG'));
    return { session, emit, result, watchdogLogs };
  }

  /**
   * The watchdog's handler awaits this import before it logs; module loading
   * doesn't advance with fake timers, so wait for it before reading the logs.
   */
  async function settle() {
    await import('../../shared/session-closing-tracker.js');
    await vi.advanceTimersByTimeAsync(0);
  }

  /** The LLM stream as the persona agent passes it on: a tool-call chunk, read to the end. */
  async function llmRequestsTool(session: object) {
    const reply = new ReadableStream<object>({
      start(controller) {
        controller.enqueue({
          id: 'c1',
          delta: {
            role: 'assistant',
            toolCalls: [{ type: 'function_call', name: 'getWeatherForecast' }],
          },
        });
        controller.close();
      },
    });
    const tapped = tapToolCalls(reply, session);
    expect(tapped).not.toBeNull();
    await tapped?.pipeTo(new WritableStream());
  }

  it('tool call (2.5 s) then reply 2 s later: the watchdog never fires', async () => {
    const { session, emit, result, watchdogLogs } = setup();
    emit(voice.AgentSessionEventTypes.UserStateChanged, {
      newState: 'listening',
      oldState: 'speaking',
    });
    await vi.advanceTimersByTimeAsync(800);
    await llmRequestsTool(session);
    await vi.advanceTimersByTimeAsync(2500);
    emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, {
      functionCalls: [],
      functionCallOutputs: [],
    });
    await vi.advanceTimersByTimeAsync(2000);
    emit(voice.AgentSessionEventTypes.AgentStateChanged, {
      newState: 'speaking',
      oldState: 'thinking',
    });
    await vi.advanceTimersByTimeAsync(EMPTY_RESPONSE_WATCHDOG_MS * 2);
    await settle();
    result.clearTimers();
    expect(watchdogLogs()).toEqual([]);
  });

  it('no reply after the tool results: the watchdog fires', async () => {
    const { session, emit, result, watchdogLogs } = setup();
    emit(voice.AgentSessionEventTypes.UserStateChanged, {
      newState: 'listening',
      oldState: 'speaking',
    });
    await vi.advanceTimersByTimeAsync(800);
    await llmRequestsTool(session);
    await vi.advanceTimersByTimeAsync(2500);
    emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, {
      functionCalls: [],
      functionCallOutputs: [],
    });
    await vi.advanceTimersByTimeAsync(EMPTY_RESPONSE_WATCHDOG_MS + 100);
    await settle();
    result.clearTimers();
    expect(watchdogLogs().length).toBeGreaterThan(0);
  });
});
