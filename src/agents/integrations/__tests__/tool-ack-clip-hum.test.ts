/**
 * TOOL_ACK_CLIP + TOOL_HUM on one call: at most one opening sound a caller turn
 * (opening-sound-ledger.ts). Verifier, PR #2857 round 1: both flags on and a 2 s
 * tool played "Let me look." at tool start and then the hum at 1.2 s.
 */
import { EventEmitter } from 'node:events';
import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachToolAckClipToCall } from '../tool-ack-clip-wiring.js';
import { startToolHum, TOOL_HUM_DELAY_MS } from '../tool-hum.js';
import {
  noteOpeningSound,
  openingSoundThisTurn,
  trackTurnSounds,
} from '../opening-sound-ledger.js';
import { LEAD_INS } from '../../personas/tool-lead-in.js';
import * as cache from '../../shared/conversational-audio-cache.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { noteCrisisVerdictPending } from '../../safety/crisis-gate-signal.js';

interface Item {
  type: string;
  callId: string;
  name?: string;
}
let n = 0;

/** A live call on Ferni: TOOL_HUM always on, the TOOL_ACK_CLIP wiring when `clip`. */
function call(opts: { clip: boolean }) {
  const sessionId = `ack-hum-${++n}`;
  const session = Object.assign(new EventEmitter(), {
    userData: { services: { sessionId } },
    history: { items: [] as object[] },
  });
  const clips: string[] = [];
  const hums: ArrayBuffer[] = [];
  // The hum first, so it arms before the clip plays: the ledger is read when it would start.
  startToolHum(
    session as never,
    { play: (pcm) => (hums.push(pcm), true), stop: () => {} },
    {
      TOOL_HUM: 'on',
    }
  );
  if (opts.clip) {
    attachToolAckClipToCall(
      session as never,
      sessionId,
      { playClip: (t) => (clips.push(t), true), wireDelayMs: () => 60 },
      () => 'ferni'
    );
  }
  /** The caller speaks, stops, and the turn commits. */
  const callerSays = (words: string): void => {
    session.emit('user_state_changed', { newState: 'speaking' });
    session.emit('user_state_changed', { newState: 'listening' });
    session.emit('conversation_item_added', { item: { role: 'user', textContent: words } });
  };
  /** The SDK starts `name` on a reply; returns its finish. */
  const startTool = (name: string, callId = 'c1') => {
    const cbs = new Set<(item: Item) => void>();
    session.emit(voice.AgentSessionEventTypes.SpeechCreated, {
      speechHandle: {
        _addItemAddedCallback: (cb: (item: Item) => void) => cbs.add(cb),
        _removeItemAddedCallback: (cb: (item: Item) => void) => cbs.delete(cb),
        addDoneCallback: () => {},
      },
    });
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'thinking' });
    cbs.forEach((cb) => cb({ type: 'function_call', name, callId }));
    return () => cbs.forEach((cb) => cb({ type: 'function_call_output', callId }));
  };
  return { session, sessionId, clips, hums, callerSays, startTool };
}

describe('TOOL_ACK_CLIP and TOOL_HUM: one opening sound a turn', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Int16Array(12000).buffer)) // 500 ms clips
    );
    vi.stubEnv('CARTESIA_API_KEY', 'test-key');
    vi.stubEnv('SKIP_CONVERSATIONAL_PREWARM', 'true');
    vi.stubEnv('TOOL_ACK_CLIP', 'on');
    cache.clearConversationalCache();
    resetCrisisCallRisk();
    await cache.prewarmConversationalAudio();
    await cache.warmPersonaReactions('ferni');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    cache.clearConversationalCache();
    resetCrisisCallRisk();
  });

  it('both flags on, a 2 s tool: the clip plays and the hum does not', () => {
    const c = call({ clip: true });
    c.callerSays('what is the weather tomorrow');
    const done = c.startTool('getWeather');
    vi.advanceTimersByTime(2000);
    done();
    expect(c.clips).toEqual([LEAD_INS[0]]);
    expect(c.hums).toHaveLength(0);
    // The ledger is per caller turn: the next one starts clean.
    c.callerSays('thanks');
    expect(openingSoundThisTurn(c.session)).toBe(false);
  });

  it('TOOL_HUM on, clip off, a 2 s tool: the hum plays and counts as the turn’s sound', () => {
    const untracked = call({ clip: false });
    untracked.callerSays('what is the weather tomorrow');
    untracked.startTool('getWeather');
    vi.advanceTimersByTime(2000);
    expect(untracked.hums).toHaveLength(1);

    // A call with the ledger on (SLOW_TURN_SOUND tracks it too): the hum plays and records itself.
    const c = call({ clip: false });
    trackTurnSounds(c.session);
    c.callerSays('what is the weather tomorrow');
    c.startTool('getWeather');
    expect(openingSoundThisTurn(c.session)).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(c.clips).toEqual([]);
    expect(c.hums).toHaveLength(1);
    expect(openingSoundThisTurn(c.session)).toBe(true);
  });

  it('reads the ledger when the hum would start, not when it is armed', () => {
    const c = call({ clip: false });
    trackTurnSounds(c.session);
    c.callerSays('what is the weather tomorrow');
    c.startTool('getWeather'); // armed: no sound yet this turn
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS / 2);
    noteOpeningSound(c.session, 'slow'); // a slow-turn sound lands in between
    vi.advanceTimersByTime(2000);
    expect(c.hums).toHaveLength(0);
  });

  it('clip skipped for a pending crisis verdict: the hum plays as before (pinned)', () => {
    const c = call({ clip: true });
    noteCrisisVerdictPending(c.session, new Promise(() => {}));
    c.callerSays('can you look up the news');
    c.startTool('getNews');
    vi.advanceTimersByTime(2000);
    expect(c.clips).toEqual([]);
    // TOOL_HUM does not read the crisis verdict, only crisis risk (presence-heavy.ts).
    expect(c.hums).toHaveLength(1);
  });

  it('clip skipped as the caller talks over the tool: hum only 1.2 s after they stop', () => {
    const c = call({ clip: true });
    c.callerSays('what is the weather like');
    c.session.emit('user_state_changed', { newState: 'speaking' });
    c.startTool('getWeather');
    vi.advanceTimersByTime(3000);
    expect(c.clips).toEqual([]);
    expect(c.hums).toHaveLength(0);
    c.session.emit('user_state_changed', { newState: 'listening' });
    vi.advanceTimersByTime(TOOL_HUM_DELAY_MS);
    expect(c.hums).toHaveLength(1);
  });
});
