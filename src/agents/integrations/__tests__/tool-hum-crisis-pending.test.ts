/**
 * The tool hum (TOOL_HUM, on in prod) never plays while the crisis classifier
 * is still deciding the turn (crisis-gate-signal.ts: no casual sound while a
 * verdict is pending), read when the hum is due, not when it was armed: a
 * classifier-only verdict can still be pending when the tool starts and land
 * ~300 ms later. Real startToolHum on a session, real crisis-gate signals.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm, voice } from '@livekit/agents';
import { startToolHum, TOOL_HUM_DELAY_MS } from '../tool-hum.js';
import {
  crisisVerdictPending,
  noteCrisisVerdictPending,
  signalCrisisDecision,
} from '../../safety/crisis-gate-signal.js';
import {
  noteCrisisRisk,
  resetCrisisCallRisk,
} from '../../../services/safety/crisis-call-risk.js';

let n = 0;

/** A light call (nothing heavy said) with TOOL_HUM on; `tool()` starts a slow tool. */
function call() {
  const sessionId = `hum-pending-${++n}`;
  const history = llm.ChatContext.empty();
  history.addMessage({ role: 'user', content: "what's the weather like" });
  const session = Object.assign(new EventEmitter(), {
    userData: { services: { sessionId } },
    history,
  });
  const player = { play: vi.fn(() => true), stop: vi.fn() };
  const stop = startToolHum(session as never, player, { TOOL_HUM: 'on' });
  const items = new Set<(item: { type: string; callId: string }) => void>();
  const tool = (callId = 'c1') => {
    session.emit(voice.AgentSessionEventTypes.SpeechCreated, {
      speechHandle: {
        _addItemAddedCallback: (cb: (item: { type: string; callId: string }) => void) =>
          items.add(cb),
        _removeItemAddedCallback: () => {},
        addDoneCallback: () => {},
      },
    });
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'thinking' });
    items.forEach((cb) => cb({ type: 'function_call', callId }));
  };
  return { session, sessionId, player, stop, tool };
}

/** The classifier's verdict on this turn, as crisis-gate.ts registers it. */
function pendingVerdict(session: object) {
  let decide!: (d: { action: string }) => void;
  const verdict = new Promise<{ action: string }>((resolve) => (decide = resolve));
  verdict.then((d) => signalCrisisDecision(session, d.action)).catch(() => undefined);
  noteCrisisVerdictPending(session, verdict);
  return decide;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  resetCrisisCallRisk();
});

describe('tool hum and a pending crisis verdict', () => {
  it('no crisis signal at all: the hum plays (the hum still works)', async () => {
    const c = call();
    c.tool();
    expect(c.player.play).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(TOOL_HUM_DELAY_MS);
    expect(c.player.play).toHaveBeenCalledTimes(1);
    c.stop();
  });

  it('verdict still pending when the timer fires: no hum, and none later in that tool run', async () => {
    const c = call();
    const decide = pendingVerdict(c.session);
    c.tool();
    await vi.advanceTimersByTimeAsync(TOOL_HUM_DELAY_MS);
    expect(crisisVerdictPending(c.session)).not.toBeNull();
    expect(c.player.play).not.toHaveBeenCalled();

    // The verdict lands safe after the skip and the agent state moves: still silent (no re-arm).
    decide({ action: 'pass' });
    await vi.advanceTimersByTimeAsync(0);
    expect(crisisVerdictPending(c.session)).toBeNull();
    c.session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'listening' });
    c.session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'thinking' });
    await vi.advanceTimersByTimeAsync(TOOL_HUM_DELAY_MS * 4);
    expect(c.player.play).not.toHaveBeenCalled();
    c.stop();
  });

  it('pending at tool start, decided safe 300 ms later: the hum plays at 1.2 s', async () => {
    const c = call();
    const decide = pendingVerdict(c.session);
    c.tool();
    await vi.advanceTimersByTimeAsync(300);
    decide({ action: 'pass' });
    await vi.advanceTimersByTimeAsync(TOOL_HUM_DELAY_MS - 300);
    expect(c.player.play).toHaveBeenCalledTimes(1);
    c.stop();
  });

  it('pending at tool start, decided crisis 300 ms later: no hum', async () => {
    const c = call();
    const decide = pendingVerdict(c.session);
    c.tool();
    await vi.advanceTimersByTimeAsync(300);
    decide({ action: 'guide' });
    await vi.advanceTimersByTimeAsync(TOOL_HUM_DELAY_MS * 4);
    expect(c.player.play).not.toHaveBeenCalled();
    c.stop();
  });

  it('crisis risk already recorded on the call: no hum (unchanged)', async () => {
    const c = call();
    noteCrisisRisk(c.sessionId);
    c.tool();
    await vi.advanceTimersByTimeAsync(TOOL_HUM_DELAY_MS * 4);
    expect(c.player.play).not.toHaveBeenCalled();
    c.stop();
  });
});
