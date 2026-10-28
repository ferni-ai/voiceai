/**
 * LAUGH_CAP: one per-call ledger every laugh path asks (laugh-ledger.ts). Real
 * prod calls after FERNI_PLAYFUL went on had 13.5% of replies open with
 * [laughter], 128 of 151 laughs with no cue from the caller, runs of 3+ in 9 of
 * 60 calls and 37 laughs in one call (sounds-audit-2026-10-22).
 *
 * The replies go through the real text guard (heavy-laughter-guard.ts) the way
 * the gateway sends them, the turn reminder through withLaughCap and extrasFor,
 * the clips through the live backchannel loop and the Director's lever through
 * directSpeech.
 */
import { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { forgetCallerTurns } from '../../../speech/adaptive-ssml/heavy-moment.js';
import type { ReplyStream } from '../../../speech/tts-gateway/providers/cartesia-reply-stream.js';
import { laughterGuard } from '../../../speech/tts-gateway/director/heavy-laughter-guard.js';
import { RawCues } from '../../../speech/tts-gateway/director/raw-cues.js';
import { directSpeech } from '../../../speech/tts-gateway/director/reply-director.js';
import { DirectorSessions } from '../../../speech/tts-gateway/director/session-state.js';
import { initializeLiveBackchanneling } from '../../integrations/live-backchanneling-integration.js';
import { noteCrisisRisk } from '../../../services/safety/crisis-call-risk.js';
import { withPlayful } from '../ferni-playful-turn.js';
import {
  forgetLaughs,
  laughGateFor,
  MAX_CALL_LAUGHS,
  noteTurnOpened,
  withLaughCap,
} from '../laugh-ledger.js';
import { extrasFor, regexSignals } from '../turn-extras.js';
import { callerMove } from '../turn-shape.js';

const ON = {}; // LAUGH_CAP is on by default
const OFF = { LAUGH_CAP: 'off' };
const LAUGH = /\[laughter\]|^ha\b/i;
let calls = 0;
const used: string[] = [];

function newCall(): string {
  const id = `laugh-cap-${++calls}`;
  used.push(id);
  return id;
}

afterEach(() => {
  for (const id of used.splice(0)) {
    forgetLaughs(id);
    forgetCallerTurns(id);
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** What reaches the voice of one reply, written as `text`, to the caller's `said`. */
async function reply(
  call: string,
  turn: number,
  said: string,
  text: string,
  env: Record<string, string> = ON
): Promise<string> {
  const input = new ReadableStream<string>({
    start(c) {
      for (const chunk of text.match(/.{1,7}/gs) ?? []) c.enqueue(chunk);
      c.close();
    },
  });
  // As reply-caller-turn.ts hands it to the gateway, with the turn.
  const laughGate = laughGateFor(call, env);
  const guard = laughterGuard(
    { sessionId: call, turnContext: { userRequest: said, turnNumber: turn, laughGate } },
    new RawCues()
  );
  let out = '';
  for await (const chunk of input.pipeThrough(guard)) out += chunk;
  return out;
}

/** Each turn's reply as the model writes it on a playful call: opening with a laugh. */
async function laughsOver(call: string, saids: string[], env = ON): Promise<boolean[]> {
  const laughed: boolean[] = [];
  for (const [i, said] of saids.entries()) {
    laughed.push(LAUGH.test(await reply(call, i + 1, said, '[laughter] Okay, so.', env)));
  }
  return laughed;
}

const PLAIN = [
  'I went to the store today',
  'we watched a movie last night',
  'my sister is visiting next week',
  'I think I will make pasta',
  'work was fine I guess',
  'the train was a bit late',
  'I started reading a new book',
  'we might paint the kitchen',
  'the weather is nice here',
  'I have a meeting tomorrow',
];

describe('LAUGH_CAP: a laugh needs a cue from the caller', () => {
  it('a 10-turn playful call with no caller cues gets no laughs', async () => {
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    const call = newCall();
    const session = { userData: { personaId: 'ferni', services: { sessionId: call } } };
    for (const said of PLAIN) expect(withPlayful(session, said, undefined)?.playful).toBe(true);
    expect(await laughsOver(call, PLAIN)).toEqual(PLAIN.map(() => false));
  });

  it('laughs only on the turns the caller laughed: 2, 5 and 8', async () => {
    const saids = PLAIN.map((s, i) => ([1, 4, 7].includes(i) ? `hahaha ${s}` : s));
    const laughed = await laughsOver(newCall(), saids);
    expect(laughed.flatMap((l, i) => (l ? [i + 1] : []))).toEqual([2, 5, 8]);
  });

  it('caps a call where the caller laughs every turn: never two in a row, at most 4', async () => {
    const saids = Array.from({ length: 20 }, (_, i) => `haha that is so funny ${i}`);
    const laughed = await laughsOver(newCall(), saids);
    expect(laughed.filter(Boolean)).toHaveLength(MAX_CALL_LAUGHS);
    expect(laughed.flatMap((l, i) => (l ? [i + 1] : []))).toEqual([1, 4, 7, 10]);
  });

  it('strips a written "Ha," as well as [laughter], and keeps the rest', async () => {
    expect(await reply(newCall(), 1, PLAIN[0], 'Ha, okay. Which store?')).toBe(
      'Okay. Which store?'
    );
  });
});

describe('LAUGH_CAP: heavy, venting and crisis turns', () => {
  it('no laugh for 3 turns after a heavy one, however the caller laughs', async () => {
    const laughed = await laughsOver(newCall(), [
      'my dad died last week',
      'haha anyway',
      'lol okay',
      'hahaha stop',
      'haha you are ridiculous',
    ]);
    expect(laughed).toEqual([false, false, false, false, true]);
  });

  it('no laugh on a call with crisis risk noted', async () => {
    const call = newCall();
    noteCrisisRisk(call);
    expect(await laughsOver(call, ['haha okay', 'lol', 'hahaha', 'haha', 'lol yes'])).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('no laugh after venting', async () => {
    const laughed = await laughsOver(newCall(), ['I am so stressed lol', 'haha whatever']);
    expect(laughed).toEqual([false, false]);
  });
});

describe('LAUGH_CAP: one laugh at the turn edge', () => {
  it('no reply laugh on a turn an opening clip opened; the next turn may', async () => {
    const call = newCall();
    noteTurnOpened(call);
    expect(LAUGH.test(await reply(call, 1, 'hahaha', '[laughter] Okay.'))).toBe(false);
    expect(LAUGH.test(await reply(call, 2, 'haha no way', '[laughter] Okay.'))).toBe(true);
  });

  it("a laugh-along clip is the turn's laugh: the reply does not laugh again", async () => {
    vi.stubEnv('BACKCHANNELS', 'on');
    vi.stubEnv('LAUGH_ALONG', 'on');
    const call = newCall();
    const said = 'hahaha and then the cat just sat on it';
    expect(laughClipsFor(call, said)).toEqual(['[laughter]']);
    expect(LAUGH.test(await reply(call, 1, said, '[laughter] No!'))).toBe(false);
  });
});

describe('LAUGH_CAP: the "Ha" backchannel', () => {
  it('plays "Ha" to a joke, but not right after a laugh', async () => {
    vi.stubEnv('BACKCHANNELS', 'on');
    vi.stubEnv('BACKCHANNEL_CONTEXT', 'on');
    const joke = 'the whole thing was so ridiculous';
    expect(laughClipsFor(newCall(), joke)).toEqual(['Ha']);
    const call = newCall();
    await reply(call, 1, 'hahaha', '[laughter] Okay.');
    expect(laughClipsFor(call, joke)).not.toContain('Ha');
  });
});

describe('LAUGH_CAP: the turn reminder', () => {
  it('drops the laugh-along line when the reply may not laugh', async () => {
    const call = newCall();
    const session = { userData: { services: { sessionId: call } } };
    const env = { LAUGH_ALONG: 'on' };
    const lines = (said: string): string[] => {
      const sig = withLaughCap(session, said, regexSignals(said, callerMove(said)), ON);
      return extrasFor(said, callerMove(said), 'answer', false, () => 0.99, env, sig).fired;
    };
    expect(lines('haha you are ridiculous')).toContain('laugh_along');
    await reply(call, 1, 'haha you are ridiculous', '[laughter] I try.');
    expect(lines('lol stop it')).not.toContain('laugh_along'); // the turn right after a laugh
  });

  it("drops it on a turn the caller's reading calls careful, though they laughed", () => {
    const session = { userData: { services: { sessionId: newCall() } } };
    const said = 'haha so that happened';
    const tender = { ...regexSignals(said, 'share'), careful: true, laughed: true };
    const fired = (sig: typeof tender | undefined): string[] =>
      extrasFor(said, 'share', 'answer', false, () => 0.99, { LAUGH_ALONG: 'on' }, sig).fired;
    expect(fired(tender)).toContain('laugh_along'); // what the reminder asked for before
    expect(fired(withLaughCap(session, said, tender, ON))).not.toContain('laugh_along');
  });
});

/** What the Director voices of one reply to `said` (a tease its old rules laugh at). */
async function directed(
  call: string,
  said: string,
  env: Record<string, string> = ON,
  turnNumber = 10
): Promise<string> {
  const pushes: string[] = [];
  const inner: ReplyStream = {
    push: (t: string) => void pushes.push(t),
    end: () => {},
    cancel: () => {},
    async *[Symbol.asyncIterator]() {},
  };
  const out = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue("I'm just teasing you, you know that. Anyway, how was the weekend?");
        c.close();
      },
    }),
    voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    sessionId: call,
    personaId: 'jordan-taylor',
    turnContext: {
      turnNumber,
      userRequest: said,
      comfortLevel: 1,
      laughGate: laughGateFor(call, env),
    },
    env: { SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_LAUGHTER: 'live', ...env },
    sessions: new DirectorSessions(),
    onPlan: () => {},
  });
  for await (const chunk of out.textStream) out.reply.push(chunk);
  out.reply.end();
  return pushes.join('');
}

describe('LAUGH_CAP: the Director laughter lever', () => {
  it('adds no laugh on a turn with no cue from the caller', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every roll of the old rules passes
    expect(await directed(newCall(), PLAIN[0], OFF)).toContain('[laughter]'); // old rules laugh
    expect(await directed(newCall(), PLAIN[0])).not.toContain('[laughter]');
  });

  it('counts a laugh it added: the next reply does not laugh', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const call = newCall();
    expect(await directed(call, 'haha that was a good one')).toContain('[laughter]');
    expect(LAUGH.test(await reply(call, 11, 'lol stop', '[laughter] Okay.'))).toBe(false);
  });
});

describe('LAUGH_CAP=off', () => {
  it('passes every reply through exactly as before', async () => {
    const call = newCall();
    const saids = Array.from({ length: 12 }, (_, i) => `haha ${PLAIN[i % 10]}`);
    for (const [i, said] of [...PLAIN, ...saids].entries()) {
      const text = '[laughter] Ha, okay. ';
      expect(await reply(call, i + 1, said, text, OFF)).toBe(text);
    }
    const session = { userData: { services: { sessionId: call } } };
    const sig = regexSignals('lol', 'share');
    expect(withLaughCap(session, 'lol', sig, OFF)).toBe(sig);
  });
});

/** The live loop's clips for 3 s of `said` and a breath pause, on `call`. */
function laughClipsFor(call: string, said: string): string[] {
  vi.useFakeTimers({ now: 1_000_000 });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const played: string[] = [];
  const bc = initializeLiveBackchanneling(call, 'ferni', {} as never, () => false, {
    playClip: (text) => (played.push(text), true),
  });
  bc.onNewTurn();
  bc.updateState({ partialTranscript: said });
  const n = 160; // 10 ms frames at 16 kHz
  for (let t = 0; t < 400; t++) {
    vi.advanceTimersByTime(10);
    const data = new Int16Array(n);
    if (t < 300)
      for (let i = 0; i < n; i++) data[i] = Math.round(12000 * Math.sin((t * n + i) / 6));
    bc.processAudioFrame(new AudioFrame(data, 16000, 1, n));
  }
  bc.cleanup();
  vi.useRealTimers();
  return played;
}
