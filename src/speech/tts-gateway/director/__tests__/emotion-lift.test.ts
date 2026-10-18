/**
 * EMOTION_LIFT: Ferni rests calm and lifts on bright words (Seth's "lively"
 * pick, 2026-10-17: calm B at excited / 1.08).
 *
 * Asserted on the request bodies the real Cartesia provider sends over its
 * socket (openReplyStream through the Director).
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetCallerTurns } from '../../../adaptive-ssml/heavy-moment.js';
import { CartesiaTTSProvider } from '../../providers/cartesia.js';
import { CartesiaSocket } from '../../providers/cartesia-socket.js';
import { resetFerniRestingVoiceWarnings } from '../ferni-resting-voice.js';
import { resetPersonaDeliveryCache } from '../persona-delivery.js';
import { directSpeech } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const CALM_B = '2e7f8a26-1627-4d66-88dc-293c297c1619';
const LIVELY = {
  SPEECH_DIRECTOR: 'live',
  FERNI_VOICE_EMOTION: 'excited',
  FERNI_VOICE_SPEED: '1.08',
};
const LIFT = { ...LIVELY, EMOTION_LIFT: 'on' };

let sent: Array<{ transcript: string }>;

beforeEach(() => {
  sent = [];
  resetFerniRestingVoiceWarnings();
  forgetCallerTurns('lift');
  resetPersonaDeliveryCache();
  vi.spyOn(CartesiaSocket.prototype, 'send').mockImplementation(async (_id, request) => {
    sent.push(request as (typeof sent)[number]);
  });
});

afterEach(() => vi.restoreAllMocks());

interface SpeakOpts {
  personaId?: string;
  sessions?: DirectorSessions;
  /** What the caller just said. */
  caller?: string;
  userEmotion?: string;
  /** The pieces pushed to Cartesia (default: the whole text in one push). */
  pushes?: string[];
  /** What the LLM had streamed when the opening was decided (default: the whole text). */
  streamed?: string;
}

/** One reply through the Director into the real provider; every request transcript it sent. */
async function speakAll(text: string, env: Record<string, string>, opts: SpeakOpts = {}) {
  const from = sent.length;
  const pushes = opts.pushes ?? [text];
  const directed = directSpeech(new CartesiaTTSProvider().openReplyStream(CALM_B), {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(opts.streamed ?? text);
        c.close();
      },
    }),
    voiceId: CALM_B,
    sessionId: 'lift',
    personaId: opts.personaId ?? 'ferni',
    env,
    sessions: opts.sessions ?? new DirectorSessions(),
    turnContext: {
      userRequest: opts.caller,
      userEmotion: opts.userEmotion ? { primary: opts.userEmotion } : undefined,
    },
    onPlan: () => {},
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const piece of pushes) directed.reply.push(piece);
  directed.reply.end();
  await vi.waitFor(() => expect(sent.length - from).toBeGreaterThanOrEqual(pushes.length + 1));
  return sent.slice(from, from + pushes.length).map((r) => r.transcript);
}

/** The opening request transcript of one reply. */
async function speak(text: string, env: Record<string, string>, opts: SpeakOpts = {}) {
  return (await speakAll(text, env, opts))[0] ?? '';
}

const PLAIN = { SPEECH_DIRECTOR: 'live' };
const tagOf = (push: string, name: 'emotion' | 'speed'): string | undefined =>
  new RegExp(`<${name} (?:value|ratio)="([^"]+)"/>`).exec(push)?.[1];

describe('EMOTION_LIFT: bright replies lift', () => {
  it('a funny reply is sent excited at 1.08', async () => {
    const push = await speak('That was so funny, ha.', LIFT);
    expect(push).toBe('<speed ratio="1.08"/><emotion value="excited"/>That was so funny, ha. ');
  });

  it('a bright question is excited, not curious', async () => {
    const off = await speak('Wow, how did the first day go?', LIVELY);
    expect(tagOf(off, 'emotion')).toBe('curious');
    const push = await speak('Wow, how did the first day go?', LIFT);
    expect(tagOf(push, 'emotion')).toBe('excited');
    expect(tagOf(push, 'speed')).toBe('1.08');
  });

  it("on a bright reply the LLM's own curious gives way to excited", async () => {
    const text = '<emotion value="curious"/>Ha, and then what happened?';
    expect(tagOf(await speak(text, LIVELY), 'emotion')).toBe('curious');
    expect(tagOf(await speak(text, LIFT), 'emotion')).toBe('excited');
  });

  it('no reply runs faster than FERNI_VOICE_SPEED, even turn after bright turn', async () => {
    const sessions = new DirectorSessions();
    for (const line of ['Ha, I love that.', 'That is great news.', 'Wow, so much fun.']) {
      const push = await speak(line, LIFT, { sessions });
      expect(Number(tagOf(push, 'speed'))).toBeLessThanOrEqual(1.08);
      expect(tagOf(push, 'emotion')).toBe('excited');
    }
  });
});

describe('EMOTION_LIFT: other replies rest', () => {
  it('a neutral reply rests at 1.03 with no upbeat tone', async () => {
    const push = await speak('I checked the calendar for Thursday.', LIFT);
    expect(push).toBe('<speed ratio="1.03"/>I checked the calendar for Thursday. ');
  });

  it('a question that is not bright stays curious at the resting pace', async () => {
    const push = await speak('What did the doctor say about it?', LIFT);
    expect(tagOf(push, 'emotion')).toBe('curious');
    expect(tagOf(push, 'speed')).toBe('1.03');
  });
});

describe('EMOTION_LIFT: hard moments keep their tone and normal pace', () => {
  it('a sympathetic reply is sent exactly as with no overrides at all', async () => {
    const plain = await speak("I'm so sorry about your dad.", { SPEECH_DIRECTOR: 'live' });
    const push = await speak("I'm so sorry about your dad.", LIFT);
    expect(tagOf(push, 'emotion')).toBe('sympathetic');
    expect(push).toBe(plain);
  });

  it('a calm reply the LLM chose keeps calm at normal pace', async () => {
    const text = '<emotion value="calm"/>Take a breath with me.';
    const plain = await speak(text, { SPEECH_DIRECTOR: 'live' });
    const push = await speak(text, LIFT);
    expect(tagOf(push, 'emotion')).toBe('calm');
    expect(push).toBe(plain);
  });
});

describe('EMOTION_LIFT: a bright reply breaks the carry-over', () => {
  const after = async (env: Record<string, string>, line: string): Promise<string> => {
    const sessions = new DirectorSessions();
    await speak("I'm so sorry about your dad.", env, { sessions });
    return speak(line, env, { sessions });
  };

  it('[laughter] after a sympathetic turn is not voiced sympathetic', async () => {
    const line = '[laughter] Okay, that part is pretty good.';
    expect(tagOf(await after(LIVELY, line), 'emotion')).toBe('sympathetic');
    const push = await after(LIFT, line);
    expect(tagOf(push, 'emotion')).toBe('excited');
  });

  it('a fun line after a sympathetic turn drops the carried tone', async () => {
    expect(tagOf(await after(LIVELY, 'He sounds like fun.'), 'emotion')).toBe('sympathetic');
    expect(tagOf(await after(LIFT, 'He sounds like fun.'), 'emotion')).toBe('excited');
  });

  it('a plain line after a sympathetic turn keeps the care', async () => {
    expect(tagOf(await after(LIFT, 'Tell me about him.'), 'emotion')).toBe('sympathetic');
  });
});

describe('EMOTION_LIFT: scope', () => {
  it('a teammate is unchanged by the flag', async () => {
    const text = 'That was so funny, ha.';
    const off = await speak(text, LIVELY, { personaId: 'maya-santos' });
    expect(await speak(text, LIFT, { personaId: 'maya-santos' })).toBe(off);
  });

  it('without FERNI_VOICE_SPEED the pace is the Director’s own', async () => {
    const env = { SPEECH_DIRECTOR: 'live', EMOTION_LIFT: 'on', FERNI_VOICE_EMOTION: 'excited' };
    const plain = await speak('I checked the calendar for Thursday.', { SPEECH_DIRECTOR: 'live' });
    expect(await speak('I checked the calendar for Thursday.', env)).toBe(plain);
  });
});

describe('EMOTION_LIFT: hard words beat laughter and bright words (review C1, L1)', () => {
  it.each([
    "[laughs] Oh no, I'm so sorry your dad died.",
    '[laughter] my dad died',
    '<emotion value="sympathetic"/>[laughter] Oh man. I\'m so sorry',
    "I love that you called. I'm so sorry about your dad.",
    "Ha, I'm so sorry about your dad.",
  ])('%s is voiced as with no overrides, never excited', async (text) => {
    const plain = await speak(text, PLAIN);
    const push = await speak(text, LIFT);
    expect(tagOf(push, 'emotion')).not.toBe('excited');
    expect(push).toBe(plain);
  });

  it.each(['sympathetic', 'contemplative', 'calm'])(
    "the LLM's own %s on a laughing line is kept, not lifted",
    async (emotion) => {
      const push = await speak(`<emotion value="${emotion}"/>[laughter] Oh man, okay.`, LIFT);
      expect(tagOf(push, 'emotion')).toBe(emotion);
      expect(tagOf(push, 'speed')).not.toBe('1.08');
    }
  );
});

describe("EMOTION_LIFT: the caller's hard moment and the whole reply (review H1)", () => {
  it('a laughing reply right after the caller says something hard is not lifted', async () => {
    const opts = { caller: 'my dad died lol' };
    const plain = await speak('[laughter] oh wow', PLAIN, opts);
    forgetCallerTurns('lift');
    const push = await speak('[laughter] oh wow', LIFT, opts);
    expect(tagOf(push, 'emotion')).not.toBe('excited');
    expect(push).toBe(plain);
  });

  it("the caller's turn before this one still counts", async () => {
    await speak('I am so sorry.', LIFT, { caller: 'my mom passed away last week' });
    const push = await speak("[laughter] that's so funny", LIFT, { caller: 'lol anyway' });
    expect(tagOf(push, 'emotion')).not.toBe('excited');
    expect(tagOf(push, 'speed')).not.toBe('1.08');
  });

  it('a reply that turns hard after its opening is not lifted', async () => {
    const push = await speak('Ha, I hear you. That sounds really hard.', LIFT);
    expect(tagOf(push, 'emotion')).not.toBe('excited');
  });

  it('the opening is judged on everything streamed so far, not its first phrase', async () => {
    const text = 'Ha, I hear you. That sounds really hard.';
    const [first] = await speakAll(text, LIFT, {
      pushes: ['Ha, I hear you. ', 'That sounds really hard.'],
    });
    expect(tagOf(first ?? '', 'emotion')).not.toBe('excited');
  });

  it('when the hard part streams after the opening, that push settles to sympathetic', async () => {
    const [first, second] = await speakAll('', LIFT, {
      streamed: 'Ha, that is funny. ',
      pushes: ['Ha, that is funny. ', "But honestly I'm worried about you."],
    });
    expect(tagOf(first ?? '', 'emotion')).toBe('excited');
    expect(second).toMatch(/^<speed ratio="1\.02"\/><emotion value="sympathetic"\/>But/);
  });
});

describe('EMOTION_LIFT: negated, shocked and sarcastic bright words (review H2)', () => {
  it.each([
    'I know you love her so much, and now she is gone.',
    "Wow, that's awful.",
    'Wow. He really said that to you?',
    "That doesn't sound like fun at all.",
    "That's not funny.",
    'Oh great, they fired you?',
  ])('%s is not lifted', async (text) => {
    const push = await speak(text, LIFT);
    expect(tagOf(push, 'emotion')).not.toBe('excited');
    expect(tagOf(push, 'speed')).not.toBe('1.08');
  });
});

describe('EMOTION_LIFT: pace limits (review M1, M3)', () => {
  it('with VOICE_ATTUNE on, a heavy reply keeps the no-overrides pace in every sentence', async () => {
    const text = "I'm so sorry about your dad. He sounds like he was a good man.";
    const pushes = ["I'm so sorry about your dad. ", 'He sounds like he was a good man.'];
    const attune = { userEmotion: 'sad', pushes };
    const plain = await speakAll(text, { ...PLAIN, VOICE_ATTUNE: 'on' }, attune);
    const lifted = await speakAll(text, { ...LIFT, VOICE_ATTUNE: 'on' }, attune);
    expect(lifted).toEqual(plain);
  });

  it("a later push's own speed tag never takes a bright reply past FERNI_VOICE_SPEED", async () => {
    const [, second] = await speakAll('', LIFT, {
      streamed: 'That was so funny, ha. And then he fell over.',
      pushes: ['That was so funny, ha. ', '<speed ratio="1"/>And then he fell over.'],
    });
    expect(Number(tagOf(second ?? '', 'speed'))).toBeLessThanOrEqual(1.08);
  });

  it("a soft start's own speed never takes the opening past FERNI_VOICE_SPEED", async () => {
    const push = await speak('<speed ratio="1.2"/>That was so funny, ha.', LIFT);
    expect(Number(tagOf(push, 'speed'))).toBeLessThanOrEqual(1.08);
  });
});
