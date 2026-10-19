/**
 * EMOTION_LIFT: Ferni lifts when the caller brings something bright (Seth's
 * "lively" pick, 2026-10-17: calm B at excited / 1.08), and otherwise rests.
 *
 * Asserted on the request bodies the real Cartesia provider sends over its
 * socket (openReplyStream through the Director). As in production, the LLM
 * has streamed only the first clause when the opening is decided, and the
 * reply reaches Cartesia clause by clause.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CartesiaTTSProvider } from '../../providers/cartesia.js';
import { CartesiaSocket } from '../../providers/cartesia-socket.js';
import { callerBright, emotionLift, forgetLiftTurns } from '../emotion-lift.js';
import { leverModes } from '../gate.js';
import { resetFerniRestingVoiceWarnings } from '../ferni-resting-voice.js';
import { resetPersonaDeliveryCache } from '../persona-delivery.js';
import { directSpeech } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const liftLog = vi.hoisted(() => vi.fn());
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: { module?: string }) =>
      bindings.module === 'EmotionLift'
        ? { info: liftLog, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
        : actual.createLogger(bindings),
  };
});

const CALM_B = '2e7f8a26-1627-4d66-88dc-293c297c1619';
const PLAIN = { SPEECH_DIRECTOR: 'live' };
const LIVELY = { ...PLAIN, FERNI_VOICE_EMOTION: 'excited', FERNI_VOICE_SPEED: '1.08' };
const LIFT = { ...LIVELY, EMOTION_LIFT: 'on' };
const GOOD = 'I got the job!!';
const LAUGH = 'haha that is the funniest thing';

let sent: Array<{ transcript: string }>;

beforeEach(() => {
  sent = [];
  resetFerniRestingVoiceWarnings();
  resetPersonaDeliveryCache();
  forgetLiftTurns('lift');
  liftLog.mockClear();
  vi.spyOn(CartesiaSocket.prototype, 'send').mockImplementation(async (_id, request) => {
    sent.push(request as (typeof sent)[number]);
  });
});

afterEach(() => vi.restoreAllMocks());

/** The reply cut into clauses, the way it reaches the Director in production. */
const clauses = (text: string): string[] => text.match(/[^,.!?]+[,.!?]*\s*/g) ?? [text];

interface SpeakOpts {
  /** What the caller just said. */
  caller?: string;
  personaId?: string;
  sessions?: DirectorSessions;
  userEmotion?: string;
  /** The pieces pushed (default: clause by clause). */
  pushes?: string[];
}

/** One reply through the Director into the real provider; every request transcript it sent. */
async function speakAll(
  text: string,
  env: Record<string, string>,
  opts: SpeakOpts = {}
): Promise<string[]> {
  const from = sent.length;
  const pushes = opts.pushes ?? clauses(text);
  const directed = directSpeech(new CartesiaTTSProvider().openReplyStream(CALM_B), {
    // Only the first clause has streamed when the opening is decided.
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(pushes[0] ?? '');
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
  await vi.waitFor(() => expect(sent.slice(from).some((r) => r.transcript === '')).toBe(true));
  return sent
    .slice(from)
    .map((r) => r.transcript)
    .filter((t) => t !== '');
}

/** The opening request transcript of one reply. */
async function speak(text: string, env: Record<string, string>, opts: SpeakOpts = {}) {
  return (await speakAll(text, env, opts))[0] ?? '';
}

const tagOf = (push: string, name: 'emotion' | 'speed'): string | undefined =>
  new RegExp(`<${name} (?:value|ratio)="([^"]+)"/>`).exec(push)?.[1];
const speeds = (pushes: string[]): number[] =>
  pushes.flatMap((p) => [...p.matchAll(/<speed ratio="([\d.]+)"\/>/g)].map((m) => Number(m[1])));
const emotions = (pushes: string[]): string[] =>
  pushes.flatMap((p) => [...p.matchAll(/<emotion value="([a-z_]+)"\/>/g)].map((m) => m[1] ?? ''));

describe('EMOTION_LIFT: a bright caller lifts the reply', () => {
  it('good news is answered excited at 1.08', async () => {
    const push = await speak('That is so great, congrats!', LIFT, { caller: GOOD });
    expect(tagOf(push, 'emotion')).toBe('excited');
    expect(tagOf(push, 'speed')).toBe('1.08');
  });

  it('a laughing caller gets an excited reply', async () => {
    const push = await speak('Ha, that is so funny.', LIFT, { caller: LAUGH });
    expect(push.startsWith('<speed ratio="1.08"/><emotion value="excited"/>')).toBe(true);
  });

  it('a question to a bright caller is excited, not curious', async () => {
    const text = 'When do you start?';
    expect(tagOf(await speak(text, LIVELY, { caller: GOOD }), 'emotion')).toBe('curious');
    expect(tagOf(await speak(text, LIFT, { caller: GOOD }), 'emotion')).toBe('excited');
  });

  it("the LLM's own curious, to a bright caller, gives way to excited", async () => {
    const text = '<emotion value="curious"/>When do you start?';
    expect(tagOf(await speak(text, LIVELY, { caller: GOOD }), 'emotion')).toBe('curious');
    forgetLiftTurns('lift');
    expect(tagOf(await speak(text, LIFT, { caller: GOOD }), 'emotion')).toBe('excited');
  });

  it('"Ha, congrats! You worked so hard for this." stays excited throughout, no flip', async () => {
    const pushes = await speakAll('Ha, congrats! You worked so hard for this.', LIFT, {
      caller: GOOD,
    });
    expect(emotions(pushes)).toEqual(['excited']);
    expect(speeds(pushes).every((s) => s === 1.08)).toBe(true);
  });

  it.each([
    'That is so great, and I bet you were crying laughing.',
    'Congrats! You must be fired up.',
    'Ha, congrats! He tells terrible jokes though.',
    'Ha, congrats! The cake was gone in minutes.',
  ])('bare or idiomatic words mid-reply never flip it: %s', async (text) => {
    const pushes = await speakAll(text, LIFT, { caller: GOOD });
    expect(emotions(pushes)).toEqual(['excited']);
  });
});

describe('EMOTION_LIFT: no lift unless the caller is bright', () => {
  it('a neutral caller gets exactly the no-overrides reply (no pace change, no tone)', async () => {
    const opts = { caller: 'can you check thursday' };
    const plain = await speakAll('I checked the calendar for Thursday.', PLAIN, opts);
    forgetLiftTurns('lift');
    expect(await speakAll('I checked the calendar for Thursday.', LIFT, opts)).toEqual(plain);
  });

  it('a question to a neutral caller stays curious, exactly as with no overrides', async () => {
    const opts = { caller: 'so anyway' };
    const plain = await speakAll('What did the doctor say about it?', PLAIN, opts);
    forgetLiftTurns('lift');
    const lifted = await speakAll('What did the doctor say about it?', LIFT, opts);
    expect(tagOf(lifted[0] ?? '', 'emotion')).toBe('curious');
    expect(lifted).toEqual(plain);
  });

  it.each([
    ['Ha, okay, so the biopsy came back?', 'they did a biopsy on monday haha'],
    ['Ha, okay, so the biopsy came back?', 'haha guess what'],
    ["Wow, you're in the ER?", 'haha guess what'],
    ["It's funny, I miss him so much.", 'haha guess what'],
    ['I know you love her so much, and now she is gone.', 'haha guess what'],
    ['Your biopsy, did it come back?', GOOD],
    ['In the ER, still?', GOOD],
    ['I miss him too, honestly.', GOOD],
    ['Ha, nice.', 'lol great'],
    ['Ha, nice.', 'ugh, perfect'],
  ])('%s (caller: %s) is sent exactly as with no overrides', async (text, caller) => {
    const plain = await speakAll(text, PLAIN, { caller });
    forgetLiftTurns('lift');
    const lifted = await speakAll(text, LIFT, { caller });
    expect(emotions(lifted)).not.toContain('excited');
    expect(lifted).toEqual(plain);
  });

  it('caller "my sister relapsed" + "Wow, how is she doing now?" is not excited', async () => {
    const push = await speak('Wow, how is she doing now?', LIFT, { caller: 'my sister relapsed' });
    expect(tagOf(push, 'emotion')).not.toBe('excited');
    expect(tagOf(push, 'speed')).not.toBe('1.08');
  });

  it('"Ha, okay, so the biopsy came back?" after a hard turn is not excited', async () => {
    const push = await speak('Ha, okay, so the biopsy came back?', LIFT, {
      caller: 'they did a biopsy on monday haha',
    });
    expect(tagOf(push, 'emotion')).not.toBe('excited');
  });

  it.each([
    ['I know you love her so much, and now she is gone.', 'she moved away'],
    ["Wow, that's awful.", 'my boss yelled at me haha'],
    ['Wow. He really said that to you?', 'he called me lazy lol'],
    ["That doesn't sound like fun at all.", 'it was not fun'],
    ["That's not funny.", 'that was not funny'],
    ['Oh great, they fired you?', 'lol they fired me'],
    ['Ha, I hear you. That sounds really hard.', 'work has been brutal'],
  ])('%s (caller: %s) is not lifted', async (text, caller) => {
    const pushes = await speakAll(text, LIFT, { caller });
    expect(emotions(pushes)).not.toContain('excited');
    expect(speeds(pushes)).not.toContain(1.08);
  });

  it('a teammate is unchanged by the flag', async () => {
    const opts = { caller: GOOD, personaId: 'maya-santos' };
    const off = await speakAll('Ha, that is so funny.', LIVELY, opts);
    forgetLiftTurns('lift');
    expect(await speakAll('Ha, that is so funny.', LIFT, opts)).toEqual(off);
  });
});

describe('EMOTION_LIFT: hard moments win (C1, L1)', () => {
  it.each([
    "[laughs] Oh no, I'm so sorry your dad died.",
    '[laughter] my dad died',
    '<emotion value="sympathetic"/>[laughter] Oh man. I\'m so sorry',
    "I'm so sorry, I love that you called.",
  ])('%s, even to a laughing caller, is voiced as with no overrides', async (text) => {
    const plain = await speakAll(text, PLAIN, { caller: LAUGH });
    forgetLiftTurns('lift');
    const lifted = await speakAll(text, LIFT, { caller: LAUGH });
    expect(emotions(lifted)).not.toContain('excited');
    expect(lifted).toEqual(plain);
  });

  it('"Ha, I\'m so sorry about your dad." settles at "sorry", never excited past the laugh', async () => {
    const pushes = await speakAll("Ha, I'm so sorry about your dad.", LIFT, { caller: LAUGH });
    expect(pushes[1]).toMatch(
      /^<speed ratio="1(?:\.0\d)?"\/><emotion value="sympathetic"\/>I'm so sorry/
    );
  });

  it.each(['sympathetic', 'contemplative', 'calm'])(
    "the LLM's own %s on a laughing line is kept, not lifted",
    async (emotion) => {
      const text = `<emotion value="${emotion}"/>[laughter] Oh man, okay.`;
      const push = await speak(text, LIFT, { caller: LAUGH });
      expect(tagOf(push, 'emotion')).toBe(emotion);
      expect(tagOf(push, 'speed')).not.toBe('1.08');
    }
  );

  it('a laughing caller right after a hard turn is not lifted', async () => {
    await speak('I am so sorry.', LIFT, { caller: 'my mom passed away last week' });
    const push = await speak('Ha, that is so funny.', LIFT, { caller: 'lol anyway' });
    expect(tagOf(push, 'emotion')).not.toBe('excited');
    expect(tagOf(push, 'speed')).not.toBe('1.08');
  });

  it('"my dad died lol" is a heavy moment, not a bright turn', async () => {
    const plain = await speakAll('[laughter] oh wow', PLAIN, { caller: 'my dad died lol' });
    forgetLiftTurns('lift');
    const lifted = await speakAll('[laughter] oh wow', LIFT, { caller: 'my dad died lol' });
    expect(emotions(lifted)).not.toContain('excited');
    expect(lifted).toEqual(plain);
  });

  it('a laughing line after a sympathetic turn is not voiced sympathetic', async () => {
    const sessions = new DirectorSessions();
    await speak("I'm so sorry about your dad.", LIFT, { caller: 'my dad is sick', sessions });
    forgetLiftTurns('lift');
    const after = '[laughter] Okay, that part is pretty good.';
    const offPush = await speak(after, LIVELY, { caller: 'he did a dance', sessions });
    expect(tagOf(offPush, 'emotion')).toBe('sympathetic');
    const sessions2 = new DirectorSessions();
    forgetLiftTurns('lift');
    await speak("I'm so sorry about your dad.", LIFT, {
      caller: 'my dad is sick',
      sessions: sessions2,
    });
    forgetLiftTurns('lift');
    const push = await speak(after, LIFT, { caller: 'he did a dance', sessions: sessions2 });
    expect(tagOf(push, 'emotion')).not.toBe('sympathetic');
  });
});

describe('EMOTION_LIFT: a lifted reply that turns hard downgrades once, and stays down', () => {
  it('strong heavy wording mid-reply goes sympathetic at the Director pace for the rest', async () => {
    const pushes = await speakAll('', LIFT, {
      caller: LAUGH,
      pushes: ['Ha, okay. ', 'Wait, your dad died? ', '<speed ratio="1.1"/>When was this?'],
    });
    expect(tagOf(pushes[0] ?? '', 'emotion')).toBe('excited');
    expect(pushes[1]).toMatch(/^<speed ratio="1(?:\.0\d)?"\/><emotion value="sympathetic"\/>/);
    const after = speeds(pushes.slice(1));
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((s) => s < 1.08)).toBe(true);
  });
});

describe('EMOTION_LIFT: pace limits (M1, M3)', () => {
  it('with VOICE_ATTUNE on, a heavy reply keeps the no-overrides pace in every sentence', async () => {
    const text = "I'm so sorry about your dad. He sounds like he was a good man.";
    const opts = { caller: 'my dad died', userEmotion: 'sad' };
    const plain = await speakAll(text, { ...PLAIN, VOICE_ATTUNE: 'on' }, opts);
    forgetLiftTurns('lift');
    const lifted = await speakAll(text, { ...LIFT, VOICE_ATTUNE: 'on' }, opts);
    expect(lifted).toEqual(plain);
  });

  it("a soft start's own speed never takes the opening past FERNI_VOICE_SPEED", async () => {
    const push = await speak('', LIFT, {
      caller: LAUGH,
      pushes: ['<speed ratio="1.2"/>Ha, ', 'that is so funny.'],
    });
    expect(Number(tagOf(push, 'speed'))).toBeLessThanOrEqual(1.08);
  });

  it.each(['1.2', '1.4'])('a later push at %s is capped at FERNI_VOICE_SPEED', async (ratio) => {
    const pushes = await speakAll('', LIFT, {
      caller: LAUGH,
      pushes: ['Ha, that is so funny. ', `<speed ratio="${ratio}"/>And then he fell over.`],
    });
    expect(Math.max(...speeds(pushes))).toBeLessThanOrEqual(1.08);
  });

  it('three bright turns in a row never exceed FERNI_VOICE_SPEED', async () => {
    const sessions = new DirectorSessions();
    for (const line of ['Ha, I love that.', 'That is great news.', 'Wow, so much fun.']) {
      // eslint-disable-next-line no-await-in-loop -- turns are sequential
      const pushes = await speakAll(line, LIFT, { caller: LAUGH, sessions });
      expect(Math.max(...speeds(pushes))).toBeLessThanOrEqual(1.08);
      expect(emotions(pushes)).toEqual(['excited']);
    }
  });

  it('without FERNI_VOICE_SPEED the pace is the Director’s own', async () => {
    const env = { ...PLAIN, EMOTION_LIFT: 'on', FERNI_VOICE_EMOTION: 'excited' };
    const plain = await speak('I checked the calendar for Thursday.', PLAIN, { caller: 'ok' });
    expect(await speak('I checked the calendar for Thursday.', env, { caller: 'ok' })).toBe(plain);
  });
});

describe('EMOTION_LIFT: only a lifted reply is capped', () => {
  it("a soft start's speed on a reply that is not lifted is sent as the Director made it", async () => {
    const opts = {
      caller: 'can you check thursday',
      pushes: ['<speed ratio="1.2"/>Sure, ', 'one sec.'],
    };
    const plain = await speakAll('', PLAIN, opts);
    forgetLiftTurns('lift');
    const lifted = await speakAll('', LIFT, opts);
    expect(Math.max(...speeds(plain))).toBeGreaterThan(1.08);
    expect(lifted).toEqual(plain);
  });
});

describe('EMOTION_LIFT: a heavy turn blocks the lift for the next two turns', () => {
  it('heavy, then bright, bright: no lift until the third turn after', async () => {
    const opts = (caller: string) => ({ caller });
    await speak('I am so sorry.', LIFT, opts('my mom passed away last week'));
    const first = await speakAll('Ha, that is so funny.', LIFT, opts('haha that was hilarious'));
    const second = await speakAll('Ha, that is so funny.', LIFT, opts('lol so funny, he fell'));
    const third = await speakAll('Ha, that is so funny.', LIFT, opts('haha the funniest part'));
    expect(emotions(first)).not.toContain('excited');
    expect(emotions(second)).not.toContain('excited');
    expect(emotions(third)).toEqual(['excited']);
  });
});

describe('callerBright', () => {
  it.each([
    'I got the job!!',
    "we're engaged!",
    'we are getting married',
    'I got in!',
    'I got accepted to the program',
    'I got promoted today',
    'I passed the bar',
    'we won the game',
    'we closed on the house',
    'we bought a house',
    'haha that was hilarious',
    'lmao 😂 so funny',
    "That's awesome!",
  ])('%s is bright', (said) => expect(callerBright(said)).toBe(true));
  it.each([
    'my sister relapsed',
    'my boss yelled at me haha',
    'haha guess what',
    'haha he fell off the couch',
    'lol great',
    'ugh, perfect',
    'yeah right, awesome',
    'lol sure, great news',
    'I got the job but my boss yelled at me',
    "I'm pregnant",
    'that was not funny',
    'ugh, seriously',
    'can you check thursday',
    undefined,
  ])('%s is not bright', (said) => expect(callerBright(said)).toBe(false));
});

describe('EMOTION_LIFT log line: one per reply, why, and never the caller text', () => {
  const lastLine = () => liftLog.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;

  it.each([
    ['That is so great, congrats!', GOOD, 'lifted', true],
    ['I checked the calendar for Thursday.', 'can you check thursday', 'caller_not_bright', false],
    ['I checked the calendar for Thursday.', '', 'no_caller_text', false],
    ['Ha, that is so funny.', 'my dad died lol', 'heavy_moment', false],
    ["I'm so sorry, that is a lot.", GOOD, 'first_clause_hard', false],
    ['Oh no, what happened?', GOOD, 'first_clause_wary', false],
    ['<emotion value="calm"/>Okay, breathe.', GOOD, 'authored_careful', false],
  ])('%s (caller: %s) logs reason %s', async (text, caller, reason, lifted) => {
    await speakAll(text, LIFT, { caller });
    expect(liftLog).toHaveBeenCalledTimes(1);
    expect(lastLine()).toMatchObject({ reason, lifted, callerTextLen: caller.length });
    expect(JSON.stringify(lastLine())).not.toContain(caller || '\u0000');
  });

  it('logs what the opening actually sent', async () => {
    await speakAll('That is so great, congrats!', LIFT, { caller: GOOD });
    expect(lastLine()).toMatchObject({ sentEmotion: 'excited', sentSpeed: 1.08 });
  });

  it('a reply rendered twice still logs once', () => {
    const lift = emotionLift(
      { personaId: 'ferni', voiceId: CALM_B, env: LIFT, turnContext: { userRequest: GOOD } },
      {},
      leverModes(LIFT)
    );
    lift?.decide({ openingText: 'Congrats! ' });
    lift?.sent({ emotion: 'excited' });
    lift?.sent({ emotion: 'excited' });
    expect(liftLog).toHaveBeenCalledTimes(1);
  });

  it('logs nothing with the flag off', async () => {
    await speakAll('That is so great, congrats!', LIVELY, { caller: GOOD });
    expect(liftLog).not.toHaveBeenCalled();
  });

  it('logs once even when no live lever renders an opening tag', async () => {
    const env = { ...LIFT, SPEECH_DIRECTOR_EMOTION: 'shadow', SPEECH_DIRECTOR_PACING: 'shadow' };
    await speakAll('That is so great, congrats!', env, { caller: GOOD });
    expect(liftLog).toHaveBeenCalledTimes(1);
    expect(lastLine()).toMatchObject({ lifted: true, sentEmotion: undefined });
  });
});
