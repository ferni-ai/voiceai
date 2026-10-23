import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNeverSilentGuard,
  FALLBACK_LINES,
  hangMs,
  neverSilentMode,
  NEVER_SILENT_HANG_MS,
  type NeverSilentSession,
} from '../never-silent.js';

function fakeSession(over: Partial<NeverSilentSession> = {}) {
  const said: Array<{ text: string; audio: boolean }> = [];
  const session = {
    agentState: 'listening',
    userState: 'listening',
    output: { audio: {}, audioEnabled: true },
    tts: null,
    interrupts: 0,
    say(text: string, opts?: { audio?: unknown }) {
      said.push({ text, audio: Boolean(opts?.audio) });
    },
    interrupt() {
      this.interrupts += 1;
    },
    ...over,
  };
  return { session, said };
}

const speech = (interrupted = false) => ({ interrupted, done: () => false });

function setup(mode: 'on' | 'shadow' = 'on', over: Partial<NeverSilentSession> = {}) {
  const { session, said } = fakeSession(over);
  const logs: Array<Record<string, unknown>> = [];
  let quiet = false;
  let paused = false;
  const guard = createNeverSilentGuard({
    session,
    mode,
    hangMs: 5000,
    toolHoldMs: 15_000,
    stayQuiet: () => quiet,
    replyPaused: () => paused,
    log: (f) => logs.push(f),
  });
  /** A caller turn as LiveKit runs it: speech created, message committed, thinking. */
  const turn = (handle = speech()) => {
    guard.onSpeechCreated({ speechHandle: handle });
    guard.onItemAdded({ item: { role: 'user' } });
    session.agentState = 'thinking';
    guard.onAgentState({ newState: 'thinking' });
    return handle;
  };
  const state = (s: string) => {
    session.agentState = s;
    guard.onAgentState({ newState: s });
  };
  return {
    session,
    said,
    logs,
    guard,
    turn,
    state,
    setQuiet: (q: boolean) => (quiet = q),
    setPaused: (p: boolean) => (paused = p),
  };
}

describe('neverSilentMode / hangMs', () => {
  it('is off unless set to on or shadow', () => {
    expect(neverSilentMode({})).toBe('off');
    expect(neverSilentMode({ NEVER_SILENT: 'ON ' })).toBe('on');
    expect(neverSilentMode({ NEVER_SILENT: 'shadow' })).toBe('shadow');
    expect(neverSilentMode({ NEVER_SILENT: 'true' })).toBe('off');
  });
  it('takes a hang deadline of at least 1 s', () => {
    expect(hangMs({})).toBe(NEVER_SILENT_HANG_MS);
    expect(hangMs({ NEVER_SILENT_HANG_MS: '3000' })).toBe(3000);
    expect(hangMs({ NEVER_SILENT_HANG_MS: '50' })).toBe(NEVER_SILENT_HANG_MS);
  });
});

describe('createNeverSilentGuard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('speaks at once when a reply is abandoned (thinking -> listening, never heard)', () => {
    const h = setup();
    h.turn();
    expect(h.said).toEqual([]);
    h.state('listening');
    expect(h.said.map((s) => s.text)).toEqual([FALLBACK_LINES[0]]);
    expect(h.logs[0]).toMatchObject({ reason: 'abandoned', sinceCommitMs: 0 });
  });

  it('stays quiet when the reply is heard', () => {
    const h = setup();
    h.turn();
    h.state('speaking');
    h.state('listening');
    vi.advanceTimersByTime(10_000);
    expect(h.said).toEqual([]);
  });

  it('a hung reply is interrupted and answered at the hang deadline, not before', () => {
    const h = setup();
    h.turn();
    vi.advanceTimersByTime(4999);
    expect(h.said).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(h.session.interrupts).toBe(1);
    expect(h.said).toHaveLength(1);
    expect(h.logs[0]).toMatchObject({ reason: 'hang', agentState: 'thinking' });
  });

  it('a running tool holds the clock; after it, the reply gets a fresh deadline', () => {
    const h = setup();
    h.turn();
    h.guard.onToolsRequested();
    vi.advanceTimersByTime(10_000);
    expect(h.said).toEqual([]);
    h.guard.onToolsExecuted();
    h.state('listening'); // between tool and follow-up: not abandoned yet
    expect(h.said).toEqual([]);
    vi.advanceTimersByTime(5000);
    expect(h.said).toHaveLength(1);
  });

  it('a tool that never returns is answered when its hold runs out', () => {
    const h = setup();
    h.turn();
    h.guard.onToolsRequested();
    vi.advanceTimersByTime(15_000);
    expect(h.said).toHaveLength(1);
  });

  it('no fallback when the caller goes on talking', () => {
    const h = setup();
    h.turn();
    h.session.userState = 'speaking';
    h.guard.onUserState({ newState: 'speaking' });
    h.state('listening');
    vi.advanceTimersByTime(10_000);
    expect(h.said).toEqual([]);
  });

  it('no fallback when the reply was interrupted on purpose', () => {
    const h = setup();
    h.turn(speech(true));
    h.state('listening');
    vi.advanceTimersByTime(10_000);
    expect(h.said).toEqual([]);
  });

  it('no fallback when no reply was attempted (AMD skip, paused scheduling)', () => {
    const h = setup();
    h.guard.onItemAdded({ item: { role: 'user' } });
    vi.advanceTimersByTime(10_000);
    expect(h.said).toEqual([]);
  });

  it('logs but stays quiet while music plays or the call closes', () => {
    const h = setup();
    h.setQuiet(true);
    h.turn();
    h.state('listening');
    expect(h.said).toEqual([]);
    expect(h.logs[0]).toMatchObject({ skipped: 'stay_quiet' });
  });

  it('shadow mode logs the fallback without speaking', () => {
    const h = setup('shadow');
    h.turn();
    h.state('listening');
    expect(h.said).toEqual([]);
    expect(h.logs[0]).toMatchObject({ reason: 'abandoned', mode: 'shadow' });
  });

  it('a text reply counts as the answer when the session has no audio', () => {
    const h = setup('on', { output: { audio: null } });
    h.turn();
    h.guard.onItemAdded({ item: { role: 'assistant' } });
    h.state('listening');
    expect(h.said).toEqual([]);
  });

  it('with audio, a recorded but unheard reply still gets the fallback', () => {
    const h = setup();
    h.turn();
    h.guard.onItemAdded({ item: { role: 'assistant' } });
    h.state('listening');
    expect(h.said).toHaveLength(1);
  });

  it('varies the line from one failure to the next', () => {
    const h = setup();
    for (let i = 0; i < 4; i++) {
      h.turn();
      h.state('listening');
    }
    expect(h.said.map((s) => s.text)).toEqual([...FALLBACK_LINES, FALLBACK_LINES[0]]);
  });

  it('a failing say is logged, not thrown', () => {
    const h = setup('on', {
      say: () => {
        throw new Error('no TTS');
      },
    });
    h.turn();
    expect(() => h.state('listening')).not.toThrow();
    expect(h.logs.at(-1)).toMatchObject({ sayFailed: 'Error: no TTS' });
  });

  it('plays the lines pre-rendered after the first reply', async () => {
    // One second of a loud 220 Hz tone: voiced all through.
    const data = Int16Array.from({ length: 24_000 }, (_, i) =>
      Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / 24_000))
    );
    const synthesize = vi.fn(async function* () {
      yield { frame: { samplesPerChannel: data.length, sampleRate: 24_000, data } };
    });
    const h = setup('on', { tts: { synthesize } });
    h.state('speaking');
    h.state('listening');
    await vi.runAllTimersAsync();
    expect(synthesize).toHaveBeenCalledTimes(FALLBACK_LINES.length);
    h.turn();
    h.state('listening');
    expect(h.said[0]).toEqual({ text: FALLBACK_LINES[0], audio: true });
  });

  it('stop() disarms and ignores later turns', () => {
    const h = setup();
    h.turn();
    h.guard.stop();
    h.turn();
    h.state('listening');
    vi.advanceTimersByTime(10_000);
    expect(h.said).toEqual([]);
  });

  it('waits for a reply paused for noise instead of apologising over it', () => {
    const h = setup();
    h.turn();
    h.setPaused(true);
    h.state('listening');
    expect(h.said).toEqual([]);
    vi.advanceTimersByTime(5000); // still paused at the deadline: wait another
    expect(h.said).toEqual([]);
    h.state('speaking'); // it resumed
    vi.advanceTimersByTime(10_000);
    expect(h.said).toEqual([]);
  });

  it('a pause that never resumes still ends in the fallback', () => {
    const h = setup();
    h.turn();
    h.setPaused(true);
    h.state('listening');
    vi.advanceTimersByTime(5000);
    h.setPaused(false);
    vi.advanceTimersByTime(5000);
    expect(h.said).toHaveLength(1);
  });
});
