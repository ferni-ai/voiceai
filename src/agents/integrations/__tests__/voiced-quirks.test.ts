/**
 * VOICED_QUIRKS: on the voiced presence path (voiced-presence.ts) a recorded
 * snore plays once a call in a long quiet, never on a heavy moment, over the
 * caller, in a handoff or during a tool call; every whistle, hum, yawn and
 * snore is recorded (quirk-log.ts), so the next reply can own it
 * (quirk-note.ts), and after a snore the caller's next turn gets one line to
 * own it out loud, once, never when they sound upset. Off, nothing changes.
 */
import { EventEmitter } from 'node:events';
import { callTune } from '../../../services/session/tune-state.js';
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
const { ASK_WINDOW_MS, quirkTurnNote } = await import('../../personas/quirk-note.js');
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

  it('never without a session id: nowhere to record it, so nothing to own', () => {
    const { session, warmUp } = call({ services: {} });
    start(session, ON);
    warmUp();
    vi.advanceTimersByTime(60_000);
    expect(snores()).toHaveLength(0);
  });

  it('never after the caller asked him to stop (NAMED_TUNE), and a control call does snore', () => {
    const held = call();
    callTune(held.sessionId).record.soundsOff = true;
    start(held.session, { ...ON, NAMED_TUNE: 'on' });
    held.warmUp();
    vi.advanceTimersByTime(60_000);
    expect(snores()).toHaveLength(0);
    const control = call();
    start(control.session, { ...ON, NAMED_TUNE: 'on' });
    control.warmUp();
    vi.advanceTimersByTime(SNORE_AT);
    expect(snores()).toHaveLength(1);
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
    expect(note).toContain('own it plainly as yours');
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

  it('a reply Ferni starts himself (no caller words) keeps it for when they speak', () => {
    const { note } = snored();
    expect(note('')).not.toContain('was I snoring');
    expect(note('ha, sorry, I zoned out')).toContain('was I snoring');
  });

  it('after his check-in reply (newer than the snore), the caller still gets it once', () => {
    const { sessionId, note } = snored();
    expect(note('')).not.toContain('was I snoring');
    vi.advanceTimersByTime(2_000);
    const checkInAt = Date.now(); // the check-in is committed to the chat
    vi.advanceTimersByTime(3_000);
    const reply = (words: string) =>
      quirkTurnNote(sessionId, chatAfter(checkInAt, words), words, {}, ON);
    expect(reply('ha, sorry, I zoned out')).toContain('was I snoring');
    expect(reply('anyway, where were we')).toBe('');
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

describe('he owns only a sound that played (the playback record)', () => {
  const ask = (sessionId: string, replyAt: number, words: string, env: Record<string, string>) =>
    quirkTurnNote(sessionId, chatAfter(replyAt, words), words, {}, env);

  it('a snore the conductor blocked is not recorded, so "did you just snore?" is told it was not him', () => {
    const blocked = call();
    start(blocked.session, ON, {
      gate: (_k: string, clip: string, play: () => boolean) => !isSnore(clip) && play(),
    });
    blocked.warmUp();
    const replyAt = Date.now();
    vi.advanceTimersByTime(60_000);
    expect(snores()).toHaveLength(0); // nothing on the wire
    expect(quirkEvents(blocked.sessionId).map((e) => e.kind)).not.toContain('snore');
    const note = ask(blocked.sessionId, replyAt, 'Wait, did you just snore?', ON);
    expect(note).not.toContain('mock snore');
    expect(note).not.toContain('own it');
    expect(note).toContain("whether that snore was you: it wasn't");
    expect(note).toContain('What played from you was a hum, not a snore.'); // the quiet-window hum did play

    const played = call(); // control: the same call with the snore on the wire
    start(played.session, ON);
    played.warmUp();
    const at = Date.now();
    vi.advanceTimersByTime(SNORE_AT);
    expect(snores()).toHaveLength(1);
    const owned = ask(played.sessionId, at, 'Wait, did you just snore?', ON);
    expect(owned).toContain('mock snore');
    expect(owned).toContain('own it plainly as yours');
    expect(owned).not.toContain("it wasn't");
  });

  it('nothing played at all: "it wasn\'t you", never an invitation to own it', () => {
    const quiet = call();
    const note = ask(quiet.sessionId, Date.now(), 'Okay, I am back. Wait, did you just snore?', ON);
    expect(quirkEvents(quiet.sessionId)).toEqual([]);
    expect(note).toContain('Nothing like that played from you in the last few minutes.');
    expect(note).not.toMatch(/own it/i);
  });

  it('a sound older than the window is not owned', () => {
    const c = call();
    start(c.session, ON);
    c.warmUp();
    vi.advanceTimersByTime(SNORE_AT);
    expect(snores()).toHaveLength(1);
    vi.advanceTimersByTime(ASK_WINDOW_MS + 1);
    const note = ask(c.sessionId, Date.now() - 1, 'were you snoring earlier?', ON);
    expect(note).not.toContain('mock snore');
    expect(note).toContain('Nothing like that played from you in the last few minutes.');
  });

  it('owning one: plainly, a joke is fine, no made-up cause', () => {
    const c = call();
    start(c.session, { ...ON, PRESENCE_SOUND_ASSETS: 'on' });
    c.warmUp();
    const replyAt = Date.now();
    vi.advanceTimersByTime(5_000);
    expect(quirkEvents(c.sessionId)[0]).toMatchObject({ kind: 'whistle' });
    const note = ask(c.sessionId, replyAt, 'were you just whistling?', ON);
    expect(note).toContain('You whistled a few bars');
    expect(note).toContain("don't deny it or make up a cause (the coffee, the house, the line)");
    expect(note).not.toContain('say why');
  });

  it('"is that you?" about a melody while a whistle is in the record: owned, not denied', () => {
    const c = call();
    start(c.session, { ...ON, PRESENCE_SOUND_ASSETS: 'on' });
    c.warmUp();
    const replyAt = Date.now();
    vi.advanceTimersByTime(5_000);
    const note = ask(c.sessionId, replyAt, 'is that you? what a melody', ON);
    expect(note).toContain('You whistled a few bars');
    expect(note).not.toContain("it wasn't");
  });

  it('with TOOL_HUM on, the record cannot vouch for a hum: no "it wasn\'t you"', () => {
    const c = call();
    expect(ask(c.sessionId, Date.now(), 'were you humming?', { ...ON, TOOL_HUM: 'on' })).toBe('');
    expect(ask(c.sessionId, Date.now(), 'were you humming?', ON)).toContain("it wasn't");
  });

  it('VOICED_QUIRKS off: no "it wasn\'t you" note, and the asked line is as before', () => {
    const off = { ...BASE, PRESENCE_SNORE: 'on' };
    const quiet = call();
    expect(ask(quiet.sessionId, Date.now(), 'did you just snore?', off)).toBe('');
    const c = call();
    start(c.session, off); // QUIRK_AWARENESS on, voiced records off: nothing logged
    c.warmUp();
    vi.advanceTimersByTime(60_000);
    expect(ask(c.sessionId, Date.now(), 'were you humming?', off)).toBe('');
  });

  it('never on a crisis turn', () => {
    const c = call();
    const words = 'did you just snore?';
    expect(quirkTurnNote(c.sessionId, chatAfter(0, words), words, { careful: true }, ON)).toBe('');
  });
});
