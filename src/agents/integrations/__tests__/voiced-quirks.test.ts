/**
 * VOICED_QUIRKS: on the voiced presence path (voiced-presence.ts) a recorded
 * snore plays once a call in a long quiet, never on a heavy moment, over the
 * caller, in a handoff or during a tool call; every whistle, hum, yawn and
 * snore is recorded (quirk-log.ts), so the next reply can own it
 * (quirk-note.ts), and after a snore the caller's next turn gets one line to
 * own it out loud, once, never when they sound upset. Off, nothing changes.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm, voice } from '@livekit/agents';

const direct = vi.hoisted(() => ({ labels: [] as string[], stops: 0 }));

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

const fakeDirect = {
  playing: false,
  play: (_pcm: ArrayBuffer, _v: number, label: string) => {
    direct.labels.push(label);
    return true;
  },
  stop: () => {
    direct.stops++;
  },
  onWireTo: () => {},
  cancelIfFresh: () => false,
  lastWireMs: 50,
  close: async () => {},
};
vi.mock('../direct-clip-track.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startDirectClips: async () => fakeDirect,
}));

const { startVoicedPresence } = await import('../voiced-presence.js');
const { startBackchannelClips } = await import('../clip-player.js');
const { quirkEvents } = await import('../../../services/session/quirk-log.js');
const { quirkTurnNote } = await import('../../personas/quirk-note.js');
const { withTurnReminder } = await import('../../personas/turn-request.js');
const { markHandoffStarted } = await import('../../../handoff/unified-state.js');
const { initializeSanitizerIntegration, notifyToolStarted } =
  await import('../../../speech/coordination/sanitizer-integration.js');

const pcm = () => new Int16Array(2400).fill(8000).buffer;
const BASE = { VOICED_PRESENCE: 'on', PRESENCE_SOUNDS: 'on', QUIRK_AWARENESS: 'on' };
const ON = { ...BASE, PRESENCE_SNORE: 'on', VOICED_QUIRKS: 'on' };
const isSnore = (l: string) => /^recorded-snore:people-snoring-.+\.wav$/.test(l);
const snores = () => direct.labels.filter(isSnore);
/** rng 0.1: the quiet-window sound at ~4.8 s, the snore at 18.8 s of quiet. */
const SNORE_AT = 18_800;

let n = 0;
function call(userData: Record<string, unknown> = {}) {
  const sessionId = `voiced-quirks-${++n}`;
  const session = new EventEmitter() as EventEmitter & { userData: unknown };
  session.userData = { services: { sessionId }, ...userData };
  const agent = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: s });
  const user = (s: string) =>
    session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: s });
  const warmUp = () => {
    for (let i = 0; i < 3; i++) {
      agent('speaking');
      agent('listening');
    }
  };
  return { session, sessionId, agent, user, warmUp };
}

const start = (session: EventEmitter, env: Record<string, string>, extra = {}) =>
  startVoicedPresence({
    session: session as never,
    direct: fakeDirect,
    mixerBusy: () => false,
    getClip: pcm,
    personaId: () => 'ferni',
    rng: () => 0.1,
    now: () => new Date('2026-10-12T18:00:00Z'),
    env,
    ...extra,
  });

/** His last reply at `replyAt`, then the caller's `words` now. */
function chatAfter(replyAt: number, words: string) {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'assistant', content: 'Take your time.', createdAt: replyAt });
  chat.addMessage({ role: 'user', content: words, createdAt: Date.now() });
  return chat;
}

beforeEach(() => {
  vi.useFakeTimers();
  direct.labels = [];
  direct.stops = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('flag off: prod behaviour unchanged', () => {
  it('no snore and no quirk records, whatever PRESENCE_SNORE and QUIRK_AWARENESS say', () => {
    const { session, sessionId, warmUp } = call();
    start(session, { ...BASE, PRESENCE_SNORE: 'on', PRESENCE_SOUND_ASSETS: 'on' });
    warmUp();
    vi.advanceTimersByTime(60_000);
    expect(direct.labels).toHaveLength(1); // the quiet-window whistle, as before
    expect(snores()).toHaveLength(0);
    expect(quirkEvents(sessionId)).toEqual([]);
  });
});

describe('the long-quiet snore, flag on', () => {
  it('plays a recorded snore after the long quiet, once a call, and records it to own', () => {
    const { session, sessionId, warmUp } = call();
    start(session, ON);
    warmUp();
    vi.advanceTimersByTime(SNORE_AT - 1);
    expect(snores()).toHaveLength(0); // the hum, not yet the snore
    vi.advanceTimersByTime(1);
    expect(snores()).toHaveLength(1);
    warmUp();
    vi.advanceTimersByTime(60_000);
    expect(snores()).toHaveLength(1);
    const snore = quirkEvents(sessionId).find((e) => e.kind === 'snore');
    expect(snore).toMatchObject({ source: 'clip', ownIt: true, personaId: 'ferni' });
    expect(isSnore(snore!.clip!)).toBe(true);
    expect(snore!.reason).toContain('quiet for about 19 seconds');
  });

  it('never on a heavy moment', () => {
    const { session, warmUp } = call({ voiceEmotion: { primary: 'sad' } });
    start(session, ON);
    warmUp();
    vi.advanceTimersByTime(60_000);
    expect(direct.labels).toHaveLength(0);
  });

  it('never while the caller speaks; their quiet after counts from when they stop', () => {
    const { session, warmUp, user } = call();
    start(session, ON);
    warmUp();
    user('speaking');
    vi.advanceTimersByTime(60_000);
    expect(snores()).toHaveLength(0);
    user('listening');
    vi.advanceTimersByTime(SNORE_AT);
    expect(snores()).toHaveLength(1);
    user('speaking');
    expect(direct.stops).toBe(1); // cut the moment they speak
  });

  it('never during a handoff', () => {
    const { session, sessionId, warmUp } = call();
    start(session, ON);
    markHandoffStarted(sessionId, 'peter');
    warmUp();
    vi.advanceTimersByTime(60_000);
    expect(snores()).toHaveLength(0);
  });

  it('never while a tool runs', () => {
    const { session, sessionId, warmUp } = call();
    start(session, ON);
    initializeSanitizerIntegration(sessionId);
    notifyToolStarted(sessionId, 'web_search', new Promise(() => {}));
    warmUp();
    vi.advanceTimersByTime(60_000);
    expect(snores()).toHaveLength(0);
  });

  it('asks the sound conductor as its own kind, snore', () => {
    const { session, warmUp } = call();
    const asked: string[] = [];
    start(session, ON, {
      gate: (kind: string, clip: string, play: () => boolean) => {
        asked.push(`${kind}:${clip}`);
        return !isSnore(clip) && play();
      },
    });
    warmUp();
    vi.advanceTimersByTime(60_000);
    expect(asked.filter((a) => a.startsWith('snore:recorded-snore:'))).toHaveLength(1);
    expect(snores()).toHaveLength(0); // blocked: nothing on the wire
  });
});

describe('he owns what he did', () => {
  it('a voiced whistle is recorded, and the next turn lets him own it', () => {
    const env = { ...ON, PRESENCE_SOUND_ASSETS: 'on' };
    const { session, sessionId, warmUp } = call();
    start(session, env);
    warmUp();
    const replyAt = Date.now();
    vi.advanceTimersByTime(5_000);
    const [whistle] = quirkEvents(sessionId);
    expect(whistle).toMatchObject({ kind: 'whistle', source: 'clip' });
    expect(whistle.clip).toMatch(/^whistle:people-.+\.wav$/);
    const note = quirkTurnNote(
      sessionId,
      chatAfter(replyAt, 'were you whistling just now?'),
      'were you whistling just now?',
      {},
      env
    );
    expect(note).toContain('You whistled a few bars');
    expect(note).toContain('own it playfully');
  });

  it('a voiced hum and a morning yawn are recorded with their take', () => {
    const hum = call();
    start(hum.session, ON);
    hum.warmUp();
    vi.advanceTimersByTime(5_000);
    expect(quirkEvents(hum.sessionId)[0]).toMatchObject({ kind: 'hum' });
    expect(quirkEvents(hum.sessionId)[0].clip).toMatch(/^take:(thinking|sung)-hum:\d+$/);
    const yawn = call({ callerTimezone: 'America/New_York' });
    start(yawn.session, ON, { now: () => new Date('2026-10-12T10:30:00Z') }); // 06:30 EDT
    yawn.warmUp();
    vi.advanceTimersByTime(5_000);
    expect(quirkEvents(yawn.sessionId)[0]).toMatchObject({ kind: 'yawn' });
  });
});

describe('the snore punchline', () => {
  const snored = (userData: Record<string, unknown> = {}) => {
    direct.labels = [];
    const c = call(userData);
    start(c.session, ON);
    c.warmUp();
    const replyAt = Date.now();
    vi.advanceTimersByTime(SNORE_AT);
    expect(snores()).toHaveLength(1);
    const note = (words: string, turn = {}) =>
      quirkTurnNote(c.sessionId, chatAfter(replyAt, words), words, turn, ON);
    return { ...c, note };
  };

  it('the caller next turn gets one line to own it, once', () => {
    const { note } = snored();
    const first = note('sorry, I was reading something');
    expect(first).toContain('mock snore');
    expect(first).toContain('was I snoring');
    expect(note('anyway, where were we')).not.toContain('was I snoring');
  });

  it('never when the caller sounds upset: their words or their voice', () => {
    expect(snored().note('honestly it has been a really rough week')).not.toContain(
      'was I snoring'
    );
    expect(snored().note('okay', { mood: 'anxious' })).not.toContain('was I snoring');
    expect(snored().note('okay', { careful: true })).not.toContain('was I snoring');
  });
});

describe('the live path: clip player to the next reply request', () => {
  it('startBackchannelClips plays the snore direct, and withTurnReminder carries the punchline', async () => {
    Object.entries({ ...ON, TURN_STYLE_REMINDER: 'off' }).forEach(([k, v]) => vi.stubEnv(k, v));
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const { session, sessionId, warmUp } = call();
    await startBackchannelClips({} as never, session as never, () => 'ferni', pcm);
    warmUp();
    const replyAt = Date.now();
    vi.advanceTimersByTime(30_000);
    expect(snores()).toHaveLength(1);
    expect(quirkEvents(sessionId).map((e) => e.kind)).toContain('snore');
    const chat = chatAfter(replyAt, 'mm sorry, I was just thinking');
    const sent = (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent;
    expect(sent).toContain('was I snoring');
  });
});
