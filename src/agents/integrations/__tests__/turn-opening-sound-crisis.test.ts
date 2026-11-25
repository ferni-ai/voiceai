/**
 * CRISIS_NO_OPENING_SOUND: the turn-opening "Mm" (TURN_OPENING_SOUND) on a crisis turn, through the
 * real live-call wiring (startTurnSounds, live-call-behaviors.ts) with only the audio tracks and
 * the room faked. On: none while a crisis verdict is pending or once the gate acted, and one just
 * played is cut, and the reply it held released, when the gate's decision lands. Off: as on main.
 * Controls: an ordinary turn, and a gate pass, still get the sound. Fictional words.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';

const track = vi.hoisted(() => ({ plays: 0, at: 0, cuts: 0 }));

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      return { done: () => true, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});
vi.mock('../direct-clip-track.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startDirectClips: async () => ({
    playing: false,
    play: () => ((track.plays += 1), (track.at = Date.now()), true),
    stop: () => {},
    // The real track cuts a clip played under 200 ms ago (direct-clip-track.ts).
    cancelIfFresh: () => ((track.cuts += 1), Date.now() - track.at < 200),
    lastWireMs: 57,
    close: async () => {},
  }),
}));
vi.mock('../../shared/conversational-audio-cache.js', () => ({
  getCachedAudioForPersona: () => new Int16Array(2400).fill(8000).buffer,
}));

const { startTurnSounds } = await import('../../multi-agent/live-call-behaviors.js');
const { noteCrisisVerdictPending, signalCrisisDecision } =
  await import('../../safety/crisis-gate-signal.js');
const { replyAudioHoldMs } = await import('../../../speech/output-control/reply-activity.js');

const room = { localParticipant: { publishData: async () => {} } };

function call() {
  const session = new EventEmitter() as EventEmitter & { userData: unknown };
  session.userData = {};
  const agent = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: s });
  const user = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: s });
  return { session, agent, user };
}

let n = 0;
/** One call with the turn-sound wiring on; the caller spoke and the agent has gone "thinking". */
async function startedTurn() {
  const { session, agent, user } = call();
  const sessionId = `opening-crisis-${(n += 1)}`;
  await startTurnSounds({
    room: room as never,
    session: session as never,
    sessionId,
    personaId: () => 'ferni',
    lastUserFinalTranscript: () => 'I had such a long day at work',
    cleanupFunctions: [],
  });
  user('speaking');
  vi.advanceTimersByTime(3000);
  user('listening');
  return { session, agent, sessionId };
}

beforeEach(() => {
  track.plays = 0;
  track.cuts = 0;
  track.at = 0;
  vi.stubEnv('REACTION_SIDETRACK', 'direct');
  vi.stubEnv('TURN_OPENING_SOUND', 'on');
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('plain mode: the "Mm" 650 ms after the thinking state', () => {
  it('control, ordinary turn: the sound plays, flag on or off', async () => {
    for (const flag of ['on', 'off']) {
      vi.stubEnv('CRISIS_NO_OPENING_SOUND', flag);
      track.plays = 0;
      const { agent } = await startedTurn();
      agent('thinking');
      vi.advanceTimersByTime(700);
      expect(track.plays).toBe(1);
    }
  });

  it('on: a crisis verdict pending when the wait ends, no sound, even once it clears', async () => {
    vi.stubEnv('CRISIS_NO_OPENING_SOUND', 'on');
    const { session, agent } = await startedTurn();
    let release!: () => void;
    noteCrisisVerdictPending(session, new Promise<void>((r) => (release = r)));
    agent('thinking');
    vi.advanceTimersByTime(700);
    release();
    await vi.advanceTimersByTimeAsync(100);
    expect(track.plays).toBe(0);
  });

  it('off: the same pending verdict plays the sound, as on main', async () => {
    vi.stubEnv('CRISIS_NO_OPENING_SOUND', 'off');
    const { session, agent } = await startedTurn();
    noteCrisisVerdictPending(session, new Promise<void>(() => {}));
    agent('thinking');
    vi.advanceTimersByTime(700);
    expect(track.plays).toBe(1);
  });

  it('on: after the gate replaced a reply on this call, no sound on a later turn', async () => {
    vi.stubEnv('CRISIS_NO_OPENING_SOUND', 'on');
    const { session, agent } = await startedTurn();
    signalCrisisDecision(session, 'replace');
    agent('thinking');
    vi.advanceTimersByTime(700);
    expect(track.plays).toBe(0);
  });

  it('on: a gate pass is no crisis, the sound still plays', async () => {
    vi.stubEnv('CRISIS_NO_OPENING_SOUND', 'on');
    const { session, agent } = await startedTurn();
    signalCrisisDecision(session, 'pass');
    agent('thinking');
    vi.advanceTimersByTime(700);
    expect(track.plays).toBe(1);
  });
});

describe('early mode: the clip 120 ms after the commit, holding the reply', () => {
  beforeEach(() => vi.stubEnv('TURN_OPENING_SOUND', 'early'));

  it('control, ordinary turn: the clip plays and holds the reply', async () => {
    vi.stubEnv('CRISIS_NO_OPENING_SOUND', 'on');
    const { agent, sessionId } = await startedTurn();
    agent('thinking');
    vi.advanceTimersByTime(130);
    expect(track.plays).toBe(1);
    expect(replyAudioHoldMs(sessionId)).toBeGreaterThan(0);
  });

  it('on: a crisis verdict pending at the commit, no clip', async () => {
    vi.stubEnv('CRISIS_NO_OPENING_SOUND', 'on');
    const { session, agent } = await startedTurn();
    noteCrisisVerdictPending(session, new Promise<void>(() => {}));
    agent('thinking');
    vi.advanceTimersByTime(700);
    expect(track.plays).toBe(0);
  });

  it('on: the gate decides right after the clip started: the clip is cut and the reply released', async () => {
    vi.stubEnv('CRISIS_NO_OPENING_SOUND', 'on');
    const { session, agent, sessionId } = await startedTurn();
    agent('thinking');
    vi.advanceTimersByTime(130);
    expect(track.plays).toBe(1);
    expect(replyAudioHoldMs(sessionId)).toBeGreaterThan(0);
    signalCrisisDecision(session, 'guide');
    expect(track.cuts).toBe(1);
    expect(replyAudioHoldMs(sessionId)).toBe(0);
  });

  it('on: a decision long after the clip cuts nothing', async () => {
    vi.stubEnv('CRISIS_NO_OPENING_SOUND', 'on');
    const { session, agent } = await startedTurn();
    agent('thinking');
    vi.advanceTimersByTime(130);
    vi.advanceTimersByTime(2000);
    signalCrisisDecision(session, 'guide');
    expect(track.cuts).toBe(0);
  });

  it('off: the decision cuts nothing and the hold stays, as on main', async () => {
    vi.stubEnv('CRISIS_NO_OPENING_SOUND', 'off');
    const { session, agent, sessionId } = await startedTurn();
    agent('thinking');
    vi.advanceTimersByTime(130);
    signalCrisisDecision(session, 'guide');
    expect(track.cuts).toBe(0);
    expect(replyAudioHoldMs(sessionId)).toBeGreaterThan(0);
  });
});
