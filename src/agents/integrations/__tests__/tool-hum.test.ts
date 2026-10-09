import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';
import {
  createToolHumWatcher,
  startToolHum,
  TOOL_HUM_DELAY_MS,
  toolHumEnabled,
} from '../tool-hum.js';

function setup(mood?: string) {
  vi.useFakeTimers();
  const play = vi.fn(() => true);
  const stop = vi.fn();
  const w = createToolHumWatcher({ play, stop, mood: () => mood });
  w.onAgentState('thinking');
  return { w, play, stop };
}

/** One tool call that runs `ms` and then returns. */
function runTool(w: ReturnType<typeof setup>['w'], id: string, ms: number) {
  w.toolStarted(id);
  vi.advanceTimersByTime(ms);
  w.toolFinished(id);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('when Ferni hums over a tool', () => {
  it('stays quiet for a fast tool (under 1.2 s)', () => {
    const { w, play } = setup();
    runTool(w, 'a', TOOL_HUM_DELAY_MS - 100);
    vi.advanceTimersByTime(5000);
    expect(play).not.toHaveBeenCalled();
  });

  it('hums once a slow tool has run 1.2 s in silence', () => {
    const { w, play } = setup();
    w.toolStarted('a');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS - 1);
    expect(play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('waits while he is still saying "let me check", then hums after 1.2 s of quiet', () => {
    const { w, play } = setup();
    w.onAgentState('speaking');
    w.toolStarted('a');
    vi.advanceTimersByTime(3000);
    expect(play).not.toHaveBeenCalled();
    w.onAgentState('thinking');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stops the moment he starts speaking', () => {
    const { w, play, stop } = setup();
    w.toolStarted('a');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    expect(play).toHaveBeenCalledTimes(1);
    w.onAgentState('speaking');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops the moment the caller speaks, and never starts over them', () => {
    const { w, play, stop } = setup();
    w.toolStarted('a');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    w.onUserState('speaking');
    expect(stop).toHaveBeenCalledTimes(1);

    const second = setup();
    second.w.onUserState('speaking');
    second.w.toolStarted('b');
    vi.advanceTimersByTime(5000);
    expect(second.play).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stops when the tool finishes, and only once every parallel tool is done', () => {
    const { w, play, stop } = setup();
    w.toolStarted('a');
    w.toolStarted('b');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    expect(play).toHaveBeenCalledTimes(1);
    w.toolFinished('a');
    expect(stop).not.toHaveBeenCalled();
    w.toolFinished('b');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('hums at most twice a call, and never on two tool calls in a row', () => {
    const { w, play } = setup();
    runTool(w, 't1', 3000); // hums
    runTool(w, 't2', 3000); // right after a hum: quiet
    expect(play).toHaveBeenCalledTimes(1);
    runTool(w, 't3', 3000); // hums
    runTool(w, 't4', 3000); // right after a hum: quiet
    runTool(w, 't5', 3000); // the call's two hums are spent
    expect(play).toHaveBeenCalledTimes(2);
    expect(w.hums).toBe(2);
  });

  it('a fast tool between two slow ones resets "in a row"', () => {
    const { w, play } = setup();
    runTool(w, 't1', 3000); // hums
    runTool(w, 't2', 300); // too fast to hum
    runTool(w, 't3', 3000); // not in a row with t1's hum, so it hums
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('does not hum when their voice read sad, anxious or angry', () => {
    for (const mood of ['sad', 'anxious', 'angry']) {
      const { w, play } = setup(mood);
      runTool(w, 'a', 5000);
      expect(play).not.toHaveBeenCalled();
    }
    const { w, play } = setup('happy');
    runTool(w, 'a', 5000);
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe('TOOL_HUM flag', () => {
  it('is off unless switched on', () => {
    expect(toolHumEnabled({})).toBe(false);
    expect(toolHumEnabled({ TOOL_HUM: 'off' })).toBe(false);
    expect(toolHumEnabled({ TOOL_HUM: 'on' })).toBe(true);
  });
});

/** A session that announces speech handles, as the SDK does. */
function fakeSession() {
  const session = new EventEmitter() as EventEmitter & { userData: unknown };
  session.userData = {};
  const handle = () => {
    const items = new Set<(item: { type: string; callId: string }) => void>();
    const done = new Set<() => void>();
    return {
      _addItemAddedCallback: (cb: (item: { type: string; callId: string }) => void) =>
        items.add(cb),
      _removeItemAddedCallback: (cb: (item: { type: string; callId: string }) => void) =>
        items.delete(cb),
      addDoneCallback: (cb: () => void) => done.add(cb),
      item: (type: string, callId: string) => items.forEach((cb) => cb({ type, callId })),
      finish: () => done.forEach((cb) => cb()),
    };
  };
  const speak = () => {
    const h = handle();
    session.emit(voice.AgentSessionEventTypes.SpeechCreated, { speechHandle: h });
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'thinking' });
    return h;
  };
  return { session, speak };
}

describe('startToolHum on a session', () => {
  it('with the flag off, listens to nothing and plays nothing', () => {
    vi.useFakeTimers();
    const { session, speak } = fakeSession();
    const player = { play: vi.fn(() => true), stop: vi.fn() };
    const stopHum = startToolHum(session as never, player, {});
    expect(session.eventNames()).toEqual([]);
    speak().item('function_call', 'c1');
    vi.advanceTimersByTime(5000);
    expect(player.play).not.toHaveBeenCalled();
    stopHum();
  });

  it('hums softly when the SDK starts a slow tool, and stops when its result is in', () => {
    vi.useFakeTimers();
    const { session, speak } = fakeSession();
    const player = { play: vi.fn(() => true), stop: vi.fn() };
    const stopHum = startToolHum(session as never, player, { TOOL_HUM: 'on' });
    const h = speak();
    h.item('function_call', 'c1');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    expect(player.play).toHaveBeenCalledTimes(1);
    const [pcm, volume] = player.play.mock.calls[0] as unknown as [ArrayBuffer, number];
    expect(pcm.byteLength).toBeGreaterThan(0);
    expect(volume).toBeLessThan(0.5); // quieter than the idle whistle/hum
    h.item('function_call_output', 'c1');
    expect(player.stop).toHaveBeenCalledTimes(1);
    stopHum();
    expect(session.eventNames()).toEqual([]);
  });

  it('treats FunctionToolsExecuted or the reply finishing as the tool being done', () => {
    vi.useFakeTimers();
    const { session, speak } = fakeSession();
    const player = { play: vi.fn(() => true), stop: vi.fn() };
    startToolHum(session as never, player, { TOOL_HUM: 'on' });
    speak().item('function_call', 'c1');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    session.emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, {
      functionCalls: [{ callId: 'c1' }],
    });
    expect(player.stop).toHaveBeenCalledTimes(1);

    const h = speak();
    h.item('function_call', 'c2');
    h.finish(); // cancelled before it ran 1.2 s
    vi.advanceTimersByTime(5000);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('never stops a clip that started after its hum ended', () => {
    vi.useFakeTimers();
    const { session, speak } = fakeSession();
    const player = { play: vi.fn(() => true), stop: vi.fn() };
    startToolHum(session as never, player, { TOOL_HUM: 'on' });
    const h = speak();
    h.item('function_call', 'c1');
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS + 20_000); // the hum has long played out
    h.item('function_call_output', 'c1');
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.stop).not.toHaveBeenCalled();
  });
});
