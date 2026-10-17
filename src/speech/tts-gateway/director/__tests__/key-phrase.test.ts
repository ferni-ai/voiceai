/**
 * VOICE_ATTUNE key phrase: a heavy reply is slow and soft for its first
 * sentence only, then returns fully to its non-heavy pace (explicit speed and
 * volume tags at the start of the second sentence), and carries the
 * pace it last spoke at. Everything else is byte-identical to before: replies
 * with the flag off, one-sentence heavy replies, and replies that aren't heavy.
 *
 * TODAY_* are the pushes origin/main (a3fead57a, before this change) produced
 * for the same input on the same harness.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { HEAVY, decideAttune } from '../attune.js';
import { KeyPhrase, planKeyPhrase, sentenceEnds } from '../key-phrase.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const IVC = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';
const ATTUNE = { VOICE_ATTUNE: 'on' };

class Recorder implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

async function reply(opts: {
  pushes: string[];
  env: Record<string, string>;
  userEmotion?: string;
  sessions?: DirectorSessions;
}): Promise<{ pushes: string[]; summary: PlanSummary }> {
  const inner = new Recorder();
  let summary: PlanSummary | undefined;
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(opts.pushes.join(''));
        c.close();
      },
    }),
    voiceId: IVC,
    sessionId: 'key-phrase',
    personaId: 'ferni',
    turnContext: { userEmotion: opts.userEmotion ? { primary: opts.userEmotion } : undefined },
    env: { SPEECH_DIRECTOR: 'live', ...opts.env },
    sessions: opts.sessions ?? new DirectorSessions(),
    onPlan: (s) => (summary = s),
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const p of opts.pushes) directed.reply.push(p);
  directed.reply.end();
  return { pushes: inner.pushes, summary: summary! };
}

const ratio = (push: string, tag: 'speed' | 'volume'): number | undefined => {
  const m = new RegExp(`<${tag} ratio="([\\d.]+)"/>`).exec(push);
  return m ? Number(m[1]) : undefined;
};

/** Hard news in three sentences, one push each (continuation-tts pushes a sentence at a time). */
const THREE = ["I'm so sorry, that's really hard. ", 'I am here with you. ', 'Take your time. '];
/** One heavy sentence, streamed in two pushes. */
const ONE = ["I'm so sorry, ", "that's really hard. "];
const NEUTRAL = [
  'Okay, so where do you want to start with all of it? ',
  'Take your time. ',
  'No rush. ',
];

const TODAY_THREE_ON = [
  `<speed ratio="0.86"/><volume ratio="0.8"/><emotion value="sympathetic"/>${THREE[0]}`,
  THREE[1],
  THREE[2],
];
const TODAY_THREE_LOW_ON = [
  `<speed ratio="0.86"/><volume ratio="0.8"/><emotion value="sympathetic"/>${THREE[0]}`,
  THREE[1],
  THREE[2],
];
const TODAY_THREE_OFF = [
  `<speed ratio="0.97"/><emotion value="sympathetic"/>${THREE[0]}`,
  THREE[1],
  THREE[2],
];
const TODAY_ONE_ON = [
  `<speed ratio="0.86"/><volume ratio="0.8"/><emotion value="sympathetic"/>${ONE[0]}`,
  ONE[1],
];
const TODAY_NEUTRAL_LOW_ON = [
  `<speed ratio="0.86"/><volume ratio="0.85"/><emotion value="calm"/>${NEUTRAL[0]}`,
  NEUTRAL[1],
  NEUTRAL[2],
];
/** A soft start (interrupt recovery) on hard news, reset by continuation-tts on the third sentence. */
const SOFT = [`<volume ratio="0.8"/>${THREE[0]}`, THREE[1], `<volume ratio="1"/>${THREE[2]}`];
const TODAY_SOFT_ON = [
  `<speed ratio="0.86"/><volume ratio="0.64"/><emotion value="sympathetic"/>${THREE[0]}`,
  THREE[1],
  `<volume ratio="0.8"/>${THREE[2]}`,
];

describe('a heavy reply of three sentences, flag on', () => {
  it('is slow and soft for the first sentence, then back to its usual pace from the second', async () => {
    const { pushes } = await reply({ pushes: THREE, env: ATTUNE });
    // Pre: before this change the whole reply held HEAVY (no tag after the opening).
    expect(ratio(TODAY_THREE_ON[0], 'speed')).toBe(HEAVY.speed);
    expect(ratio(TODAY_THREE_ON[0], 'volume')).toBe(HEAVY.volume);
    expect(TODAY_THREE_ON.slice(1).join('')).not.toMatch(/<speed|<volume/);
    // Post: the opening is unchanged; the second sentence resets both explicitly to
    // the neutral target, and the third needs nothing (tags persist on the context).
    expect(pushes[0]).toBe(TODAY_THREE_ON[0]);
    expect(pushes[1]).toBe(`<speed ratio="1"/><volume ratio="1"/>${THREE[1]}`);
    expect(pushes[2]).toBe(THREE[2]);
    // The words are the same words, in the same order.
    expect(pushes.map((p) => p.replace(/<(speed|volume)[^>]*>/g, ''))).toEqual(
      TODAY_THREE_ON.map((p) => p.replace(/<(speed|volume)[^>]*>/g, ''))
    );
  });

  it("returns a low caller's reply to the low target, still writing both tags", async () => {
    const { pushes } = await reply({ pushes: THREE, env: ATTUNE, userEmotion: 'sadness' });
    // Before: 0.86/0.8 (heavy words to a low caller) held for the whole reply.
    expect(TODAY_THREE_LOW_ON.slice(1).join('')).not.toMatch(/<speed|<volume/);
    expect(pushes[0]).toBe(TODAY_THREE_LOW_ON[0]);
    // Now: the low target (0.86/0.85) from the second sentence; speed is written even unchanged.
    expect(pushes[1]).toBe(`<speed ratio="0.86"/><volume ratio="0.85"/>${THREE[1]}`);
    expect(pushes[2]).toBe(THREE[2]);
  });

  it('carries the eased pace, not the heavy opening, to the next reply', async () => {
    const sessions = new DirectorSessions();
    await reply({ pushes: THREE, env: ATTUNE, sessions });
    const next = await reply({ pushes: NEUTRAL, env: ATTUNE, sessions });
    // Before: the next reply smoothed up from 0.86/0.8 (to 0.94/0.9); now from what was last spoken.
    expect(next.summary.speed).toBe(1);
    expect(next.summary.volume).toBe(1);
    expect(next.pushes[0]).not.toMatch(/<speed|<volume/);
  });

  it('composes a standing soft start and its later reset with the eased pace', async () => {
    const { pushes } = await reply({ pushes: SOFT, env: ATTUNE });
    expect(pushes[0]).toBe(TODAY_SOFT_ON[0]);
    // Before: the soft start held at 0.8 x 0.8 until the reset, then the reply's 0.8.
    expect(TODAY_SOFT_ON[1]).not.toMatch(/<volume/);
    // Now: the soft start (0.8, not yet reset) is kept, scaled by the eased loudness (1),
    // and continuation-tts's reset to 1 is composed with it (1).
    expect(pushes[1]).toBe(`<speed ratio="1"/><volume ratio="0.8"/>${THREE[1]}`);
    expect(pushes[2]).toBe(`<volume ratio="1"/>${THREE[2]}`);
  });
});

describe('unchanged from before', () => {
  it('a one-sentence heavy reply', async () => {
    const { pushes } = await reply({ pushes: ONE, env: ATTUNE });
    expect(pushes).toEqual(TODAY_ONE_ON);
  });

  it('every reply with VOICE_ATTUNE off', async () => {
    const { pushes } = await reply({ pushes: THREE, env: {} });
    expect(pushes).toEqual(TODAY_THREE_OFF);
  });

  it('a reply that is not heavy, even to a low caller', async () => {
    const { pushes } = await reply({ pushes: NEUTRAL, env: ATTUNE, userEmotion: 'sadness' });
    expect(pushes).toEqual(TODAY_NEUTRAL_LOW_ON);
    expect(pushes.slice(1).join('')).not.toMatch(/<speed|<volume/);
  });
});

describe('the parts', () => {
  it('counts sentence ends, not a trailing-off ellipsis', () => {
    expect(sentenceEnds('So sorry. Really. ')).toBe(2);
    expect(sentenceEnds('I just... I do not know')).toBe(0);
    expect(sentenceEnds('Wait, what?! ')).toBe(1);
  });

  it('eases a heavy reply toward its caller target, never brighter than neutral', () => {
    const neutral = decideAttune({ state: 'neutral', valence: 'heavy', previous: {} });
    expect(neutral.ease).toEqual({ speed: 1, volume: 1 });
    const bright = decideAttune({ state: 'bright', valence: 'heavy', previous: {} });
    expect(bright.ease).toEqual({ speed: 1, volume: 1 });
    const low = decideAttune({ state: 'low', valence: 'heavy', previous: {} });
    expect(low.ease).toEqual({ speed: 0.86, volume: 0.85 });
    expect(decideAttune({ state: 'low', valence: 'neutral', previous: {} }).ease).toBeUndefined();
  });

  it('steps once, at the first push after the first sentence ends', () => {
    const heavy = { reply: { speed: 0.86, volume: 0.8 }, caller: { speed: 0.86, volume: 0.8 } };
    const eased = { reply: { speed: 1, volume: 1 }, caller: { speed: 1, volume: 1 } };
    const k = new KeyPhrase(heavy, eased);
    k.take("I'm so sorry, ", {}, true);
    expect(k.take('that is hard. ', {}, false)).toEqual({ speed: 0.86, volume: 0.8, tags: '' });
    expect(k.spoken).toEqual({ speed: 0.86, volume: 0.8 });
    const step = k.take('I am here. ', {}, false);
    expect(step).toEqual({ speed: 1, volume: 1, tags: '<speed ratio="1"/><volume ratio="1"/>' });
    expect(k.take('Okay. ', {}, false)?.tags).toBe('');
    expect(k.spoken).toEqual({ speed: 1, volume: 1 });
    expect(planKeyPhrase(eased, eased)).toBeUndefined();
  });
});
