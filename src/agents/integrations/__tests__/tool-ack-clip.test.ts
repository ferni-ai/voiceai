/**
 * TOOL_ACK_CLIP: a cached line in the persona's own voice on the clip track
 * when a covered tool starts, in place of the in-stream lead-in.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachToolAckClip, type ToolAckDeps } from '../tool-ack-clip.js';
import { ackSilencedBy, attachToolAckClipToCall, clipVoiceIsOwn } from '../tool-ack-clip-wiring.js';
import {
  ACK_CLIP_LINES,
  ackKindFor,
  askedForTool,
  toolAckClipTexts,
} from '../../personas/tool-ack-clip-lines.js';
import { LEAD_INS, withToolLeadIn } from '../../personas/tool-lead-in.js';
import * as cache from '../../shared/conversational-audio-cache.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { signalCrisisDecision } from '../../safety/crisis-gate-signal.js';
import {
  clearReplyActivity,
  MAX_REPLY_HOLD_MS,
  replyAudioHoldMs,
} from '../../../speech/output-control/reply-activity.js';

/** Words that would claim a finished action; no acknowledgement may contain one. */
const COMPLETION =
  /\b(done|sent|called|texted|emailed|booked|saved|scheduled|finished|set|got it|all set|okay|ok|yep|there you go)\b/i;

type Fake = EventEmitter & { userData: object; history: { items: object[] } };

function fakeSession(sessionId: string): Fake {
  return Object.assign(new EventEmitter(), {
    userData: { services: { sessionId } },
    history: { items: [] as object[] },
  });
}

/** The caller speaks, stops, and the turn commits. */
function callerSays(session: EventEmitter, words: string): void {
  session.emit('user_state_changed', { newState: 'speaking' });
  session.emit('user_state_changed', { newState: 'listening' });
  session.emit('conversation_item_added', { item: { role: 'user', textContent: words } });
}

/** Core deps with every gate open; a clip for every line. */
function deps(over: Partial<ToolAckDeps> = {}) {
  let start: (name: string) => void = () => {};
  const played: string[] = [];
  const held: string[] = [];
  const d: ToolAckDeps = {
    onToolStarted: (l) => {
      start = l;
      return () => {};
    },
    asked: (w) => askedForTool(w, {}),
    clipReady: () => true,
    playClip: (t) => (played.push(t), true),
    holdReply: (t) => void held.push(t),
    replyStartedSince: () => false,
    silencedBy: () => null,
    crisisPending: () => null,
    stayQuiet: () => false,
    soundThisTurn: () => false,
    noteOpened: () => {},
    ...over,
  };
  return { d, played, held, start: (name: string) => start(name) };
}

/** What withToolLeadIn puts before a tool call, for these caller words. */
async function spokenBefore(tool: string, words: string, session: object, env: object) {
  const call = { id: '1', delta: { role: 'assistant', toolCalls: [{ name: tool }] } };
  const input = new ReadableStream<object>({
    start(c) {
      c.enqueue(call);
      c.close();
    },
  });
  const request = { items: [{ type: 'message', role: 'user', textContent: words }] };
  const out: object[] = [];
  for await (const chunk of withToolLeadIn(
    input as never,
    request as never,
    session,
    env as never
  ) as unknown as AsyncIterable<object>) {
    out.push(chunk);
  }
  expect(out.at(-1)).toEqual(call); // the tool call itself always goes through
  return out.map((c) => (c as { delta?: { content?: string } }).delta?.content ?? '').join('');
}

describe('TOOL_ACK_CLIP lines', () => {
  it('no line sounds finished, actions and calls above all', () => {
    const all = Object.values(ACK_CLIP_LINES).flat();
    expect(all.length).toBeGreaterThan(8);
    for (const line of all) expect(line, line).not.toMatch(COMPLETION);
    // The probe works: today's in-stream acks include words that read as done.
    expect(['Okay.', 'Yep.'].filter((w) => COMPLETION.test(w))).toHaveLength(2);
  });

  it('action and outreach tools only ever get an action or outreach line', () => {
    const tools = ['callOnBehalf', 'quickText', 'reachOut', 'setReminder', 'createHabit'];
    for (const tool of tools) {
      const kind = ackKindFor(tool, 'can you text my aunt and set a reminder', true);
      expect(['action', 'outreach'], tool).toContain(kind);
      for (const line of ACK_CLIP_LINES[kind!]) expect(line).not.toMatch(COMPLETION);
    }
  });

  it('covers the silent tools, never gameState or an unasked memory save', () => {
    expect(ackKindFor('quickText', 'text my aunt', true)).toBe('outreach');
    expect(ackKindFor('marketData', 'how are stocks doing', true)).toBe('lookup');
    expect(ackKindFor('recallFromMemory', 'what was her name again', false)).toBe('recall');
    expect(ackKindFor('getWeather', 'is it nice out', false)).toBe('lookup');
    expect(ackKindFor('gameState', 'let us play twenty questions', true)).toBeNull();
    expect(ackKindFor('rememberAboutUser', 'my sister Dana loves hiking', true)).toBeNull();
    expect(ackKindFor('rememberAboutUser', 'remember that Dana loves hiking', true)).toBe('action');
    expect(ackKindFor('callOnBehalf', 'my day was long', false)).toBeNull(); // not asked
  });

  it('flag off renders no ack lines; on renders each line once', () => {
    expect(toolAckClipTexts({})).toEqual([]);
    const on = toolAckClipTexts({ TOOL_ACK_CLIP: 'on' });
    expect(on).toEqual(expect.arrayContaining([...LEAD_INS, 'On it.', 'Let me think back.']));
    expect(new Set(on).size).toBe(on.length);
  });
});

describe('TOOL_ACK_CLIP at tool start', () => {
  it('plays the line when a covered tool starts and holds the reply for it, synchronously', () => {
    const session = new EventEmitter();
    const f = deps();
    attachToolAckClip(session, f.d);
    callerSays(session, 'what is the weather like tomorrow');
    expect(f.played).toEqual([]); // nothing on the commit or a streamed chunk
    expect(f.start('getWeather')).toBeUndefined(); // nothing for the tool or answer to await
    expect(f.played).toEqual([LEAD_INS[0]]);
    expect(f.held).toEqual([LEAD_INS[0]]);
  });

  it('only the first tool of a turn, never a chained one', () => {
    const session = new EventEmitter();
    const f = deps();
    attachToolAckClip(session, f.d);
    callerSays(session, 'text my aunt that I am running late');
    f.start('quickText');
    f.start('reachOut');
    expect(f.played).toEqual(['On it.']);
  });

  it('caller speaking: no clip', () => {
    const session = new EventEmitter();
    const f = deps();
    attachToolAckClip(session, f.d);
    callerSays(session, 'what is the weather like');
    session.emit('user_state_changed', { newState: 'speaking' });
    f.start('getWeather');
    expect(f.played).toEqual([]);
    // Pre/post: the same turn with the caller quiet plays it.
    session.emit('user_state_changed', { newState: 'listening' });
    callerSays(session, 'what is the weather like');
    f.start('getWeather');
    expect(f.played).toHaveLength(1);
  });

  it('a crisis or grave call gets no clip, and no crisis verdict pending either', () => {
    for (const over of [
      { silencedBy: () => 'crisis' },
      { crisisPending: () => Promise.resolve() },
    ] as Partial<ToolAckDeps>[]) {
      const session = new EventEmitter();
      const f = deps(over);
      attachToolAckClip(session, f.d);
      callerSays(session, 'can you look up the news');
      f.start('getNews');
      expect(f.played).toEqual([]);
    }
  });

  it('never the same clip twice in a row on a call, across kinds too', () => {
    const session = new EventEmitter();
    const f = deps();
    attachToolAckClip(session, f.d);
    const turns: Array<[string, string]> = [
      ['setTimer', 'set a timer for ten minutes'],
      ['callOnBehalf', 'call my sister please'],
      ['setTimer', 'set another timer for an hour'], // next action line is "On it.": skipped
      ['callOnBehalf', 'call my brother too'],
      ['callOnBehalf', 'and call my mom'],
      ['getWeather', 'what is the weather'],
      ['getWeather', 'and tomorrow'],
    ];
    for (const [tool, words] of turns) {
      callerSays(session, words);
      f.start(tool);
    }
    expect(f.played).toHaveLength(turns.length);
    expect(f.played.slice(0, 3)).toEqual(['Sure.', 'On it.', 'Sure, one sec.']);
    f.played.slice(1).forEach((line, i) => expect(line).not.toBe(f.played[i]));
  });

  it('a persona with no clip in its voice: no clip, and the in-stream lead-in stays', async () => {
    const env = { TOOL_ACK_CLIP: 'on' };
    const session = new EventEmitter();
    const f = deps({ clipReady: () => false });
    attachToolAckClip(session, f.d);
    expect(await spokenBefore('getWeather', 'is it raining', session, env)).toBe(`${LEAD_INS[0]} `);
    callerSays(session, 'is it raining');
    f.start('getWeather');
    expect(f.played).toEqual([]); // the text line said it; no clip on top
  });
});

describe('TOOL_ACK_CLIP and the in-stream lead-in', () => {
  it('flag off: the lead-in is exactly as before and the clip path is never asked', async () => {
    const session = new EventEmitter();
    let asked = 0;
    const f = deps({ clipReady: () => (asked++, true) });
    attachToolAckClip(session, f.d);
    expect(await spokenBefore('getWeather', 'is it raining', session, {})).toBe(`${LEAD_INS[0]} `);
    expect(await spokenBefore('setTimer', 'set a timer for 5 minutes', session, {})).toBe('Sure. ');
    expect(asked).toBe(0);
    // Pre/post: flag on, the same turn is left to the clip (nothing in the text).
    const on = { TOOL_ACK_CLIP: 'on' };
    expect(await spokenBefore('getWeather', 'is it raining', session, on)).toBe('');
    expect(asked).toBeGreaterThan(0);
  });

  it('flag on: a covered tool with a clip puts nothing in the text, so the answer never waits on it', async () => {
    const session = new EventEmitter();
    attachToolAckClip(session, deps().d);
    const on = { TOOL_ACK_CLIP: 'on' };
    expect(await spokenBefore('getNews', 'any news today', session, on)).toBe('');
    expect(await spokenBefore('setReminder', 'remind me at 5', session, on)).toBe('');
    // A session without the clip wiring keeps today's behaviour.
    expect(await spokenBefore('searchWeb', 'look up the score', {}, on)).toBe(`${LEAD_INS[0]} `);
  });
});

describe('TOOL_ACK_CLIP on a live call (wiring)', () => {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(new Int16Array(12000).buffer) // 500 ms
  );
  let n = 0;

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('CARTESIA_API_KEY', 'test-key');
    vi.stubEnv('SKIP_CONVERSATIONAL_PREWARM', 'true');
    vi.stubEnv('TOOL_ACK_CLIP', 'on');
    cache.clearConversationalCache();
    resetCrisisCallRisk();
    await cache.prewarmConversationalAudio();
    await cache.warmPersonaReactions('ferni');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    cache.clearConversationalCache();
    resetCrisisCallRisk();
  });

  /** A call on persona `persona`; `startTool(name)` is the SDK starting a tool. */
  function call(persona = 'ferni') {
    const sessionId = `ack-${++n}`;
    const session = fakeSession(sessionId);
    const played: string[] = [];
    let onItem: (item: object) => void = () => {};
    attachToolAckClipToCall(
      session as never,
      sessionId,
      { playClip: (t) => (played.push(t), true), wireDelayMs: () => 60 },
      () => persona
    );
    const startTool = (name: string) => {
      session.emit('speech_created', {
        speechHandle: {
          _addItemAddedCallback: (cb: (item: object) => void) => (onItem = cb),
          _removeItemAddedCallback: () => {},
          addDoneCallback: () => {},
        },
      });
      onItem({ type: 'function_call', name, callId: 'c1' });
    };
    return { session, sessionId, played, startTool };
  }

  it('plays the cached line at tool start and holds the reply for the clip only (capped)', () => {
    const c = call();
    clearReplyActivity(c.sessionId);
    callerSays(c.session, 'what is the weather tomorrow');
    c.startTool('getWeather');
    expect(c.played).toEqual([LEAD_INS[0]]);
    const hold = replyAudioHoldMs(c.sessionId);
    expect(hold).toBeGreaterThan(400); // 500 ms clip + 60 ms wire
    expect(hold).toBeLessThanOrEqual(MAX_REPLY_HOLD_MS);
  });

  it('crisis risk noted on the call: no clip (mutation-checked gate)', () => {
    const c = call();
    noteCrisisRisk(c.sessionId);
    expect(ackSilencedBy(c.session, c.sessionId)).toBe('crisis');
    callerSays(c.session, 'can you look up the news');
    c.startTool('getNews');
    expect(c.played).toEqual([]);
    // Pre/post: a call without risk plays it.
    const ok = call();
    callerSays(ok.session, 'can you look up the news');
    ok.startTool('getNews');
    expect(ok.played).toHaveLength(1);
  });

  it('a crisis decision on the call: no clip', () => {
    const c = call();
    signalCrisisDecision(c.session, 'guide');
    callerSays(c.session, 'can you look up the news');
    c.startTool('getNews');
    expect(c.played).toEqual([]);
  });

  it('hard news on the call: no clip', () => {
    const c = call();
    c.session.history.items.push({ type: 'message', role: 'user', textContent: 'my dad died' });
    expect(ackSilencedBy(c.session, c.sessionId)).not.toBeNull();
    callerSays(c.session, 'can you look up the funeral home hours');
    c.startTool('searchLocalBusinesses');
    expect(c.played).toEqual([]);
  });

  it('a persona without its own clip voice never gets Ferni’s: no clip', () => {
    expect(clipVoiceIsOwn('ferni', undefined)).toBe(true);
    expect(clipVoiceIsOwn('some-unknown-persona', undefined)).toBe(false);
    const c = call('some-unknown-persona'); // looks up Ferni's voice: refused
    callerSays(c.session, 'what is the weather');
    c.startTool('getWeather');
    expect(c.played).toEqual([]);
  });

  it('a localized session voice is not the clip voice: no clip', () => {
    const own = { personaId: 'ferni', voiceId: 'localized-voice', localized: true };
    expect(clipVoiceIsOwn('ferni', own, { SESSION_OWN_VOICE: 'on' })).toBe(false);
    expect(clipVoiceIsOwn('ferni', own, {})).toBe(true); // flag off: the reply speaks the persona voice
  });
});
