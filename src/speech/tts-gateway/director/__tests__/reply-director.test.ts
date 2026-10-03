import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';
import type { SpeechPlan } from '../types.js';

class Recorder implements ReplyStream {
  pushes: string[] = [];
  ended = false;
  cancelled = false;
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {
    this.ended = true;
  }
  cancel(): void {
    this.cancelled = true;
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {
    yield new ArrayBuffer(8);
  }
}

const VOICE = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';

/** Raw LLM text, and the pushes continuation-tts makes from it (the golden run). */
const RAW = [
  '<emotion value="sympathetic"/>Oh, I hear you. ',
  'Mrs. Johnson said the bill was $4,200 on 10/3, and honestly that is a lot of money to find in a single month when you are already stretched thin and trying to keep everything together for the kids. ',
  "[sighs] Here's the thing, you did the right thing.",
];
const PUSHES = [
  '<emotion value="sympathetic"/>Oh, I hear you. ',
  'Mrs. Johnson said the bill was $4,200 on 10/3, and honestly that is a lot of ',
  'money to find in a single month when you are already stretched thin and trying to keep everything together for the kids. ',
  "Here's the thing, you did the right thing. ",
];

async function run(
  env: Record<string, string>,
  opts: { sessionId?: string; sessions?: DirectorSessions; raw?: string[]; pushes?: string[] } = {}
) {
  const inner = new Recorder();
  const plans: Array<{ summary: PlanSummary; plan: SpeechPlan }> = [];
  const raw = opts.raw ?? RAW;
  const textStream = new ReadableStream<string>({
    start(c) {
      for (const r of raw) c.enqueue(r);
      c.close();
    },
  });
  const directed = directSpeech(inner, {
    textStream,
    voiceId: VOICE,
    sessionId: opts.sessionId ?? 'session-a',
    personaId: 'ferni',
    env,
    sessions: opts.sessions ?? new DirectorSessions(),
    onPlan: (summary, plan) => plans.push({ summary, plan }),
  });
  // Continuation reads the text before it pushes; mimic that order.
  const seen: string[] = [];
  for await (const chunk of directed.textStream) seen.push(chunk);
  for (const p of opts.pushes ?? PUSHES) directed.reply.push(p);
  directed.reply.end();
  return { inner, directed, plans, seen };
}

describe('directSpeech', () => {
  it('returns the very same streams when off', () => {
    const inner = new Recorder();
    const textStream = new ReadableStream<string>();
    const directed = directSpeech(inner, { textStream, voiceId: VOICE, env: {} });
    expect(directed.reply).toBe(inner);
    expect(directed.textStream).toBe(textStream);
  });

  it('passes the LLM text through untouched in shadow and live', async () => {
    for (const mode of ['shadow', 'live']) {
      const { seen } = await run({ SPEECH_DIRECTOR: mode });
      expect(seen).toEqual(RAW);
    }
  });
});

describe('shadow mode', () => {
  it('forwards every push byte-for-byte and ends the reply', async () => {
    const { inner } = await run({ SPEECH_DIRECTOR: 'shadow' });
    expect(inner.pushes).toEqual(PUSHES);
    expect(inner.ended).toBe(true);
  });

  it('emits exactly one aggregate plan per reply, with no transcript text', async () => {
    const { plans } = await run({ SPEECH_DIRECTOR: 'shadow' });
    expect(plans).toHaveLength(1);
    const { summary } = plans[0];
    expect(summary.mode).toBe('shadow');
    expect(summary.segments).toBeGreaterThan(0);
    expect(summary.emotion).toBe('sympathetic');
    expect(summary.pauses).toBeGreaterThan(0);
    expect(summary.pauseMs).toBeGreaterThan(0);
    expect(summary.latencyUs).toBeGreaterThan(0); // measured, not defaulted
    const logged = JSON.stringify(summary);
    for (const word of ['Johnson', 'bill', 'kids', 'thing', 'hear']) {
      expect(logged).not.toContain(word);
    }
  });

  it('plans Rust events: pauses, a breath before a long phrase, the sigh the LLM asked for', async () => {
    const { plans } = await run({ SPEECH_DIRECTOR: 'shadow' });
    const events = plans[0].plan.segments.flatMap((s) => s.rustEvents);
    expect(events.some((e) => e.type === 'pause')).toBe(true);
    expect(events.some((e) => e.type === 'breath')).toBe(true);
    expect(events.some((e) => e.type === 'sigh')).toBe(true);
    expect(plans[0].summary.sighs).toBe(1);
    // Only the first segment carries Cartesia controls: one emotion per reply.
    const controlled = plans[0].plan.segments.filter((s) => s.cartesiaControls);
    expect(controlled).toHaveLength(1);
    expect(controlled[0]).toBe(plans[0].plan.segments[0]);
  });
});

describe('live mode', () => {
  it('re-phrases, leaves conventional forms to Cartesia, and sets one emotion and speed', async () => {
    const { inner } = await run({ SPEECH_DIRECTOR: 'live' });
    const all = inner.pushes.join('');
    expect(all).toContain('Mrs. Johnson said the bill was $4,200 on 10/3,');
    expect(all).toContain("Here's the thing, you did the right thing.");
    // The 80-char fallback cut ("a lot of | money") is gone: no push ends mid-phrase.
    expect(inner.pushes.some((p) => p.trim().endsWith('a lot of'))).toBe(false);
    expect(inner.pushes[1].trim().endsWith('on 10/3,')).toBe(true);
    // One emotion and one speed, on the opening only.
    expect(inner.pushes[0]).toMatch(
      /^<speed ratio="0\.97"\/><emotion value="sympathetic"\/>Oh, I hear you\. $/
    );
    expect(inner.pushes.slice(1).join('')).not.toMatch(/<emotion|<speed/);
    expect(inner.ended).toBe(true);
  });

  it('conserves every spoken word across re-phrasing', async () => {
    const { inner } = await run({
      SPEECH_DIRECTOR: 'live',
      SPEECH_DIRECTOR_NORMALIZE: 'off',
      SPEECH_DIRECTOR_PAUSES: 'off',
    });
    const words = (s: string) =>
      s
        .replace(/<[^>]+>/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    expect(words(inner.pushes.join(' '))).toEqual(words(PUSHES.join(' ')));
  });

  it('applies only the levers that are live', async () => {
    const pushes = [
      '<emotion value="sympathetic"/>Oh, I hear you. ',
      'That is **REALLY** a lot of money to find in a single month, and honestly that is ',
      'more than anyone should have to carry. ',
    ];
    const { inner, plans } = await run(
      {
        SPEECH_DIRECTOR: 'live',
        SPEECH_DIRECTOR_PHRASING: 'shadow',
        SPEECH_DIRECTOR_EMOTION: 'off',
        SPEECH_DIRECTOR_PACING: 'off',
      },
      { raw: pushes, pushes }
    );
    // Phrasing in shadow: the mid-phrase cut is not re-cut, one push per push.
    expect(inner.pushes).toHaveLength(pushes.length);
    // Emotion and pacing off: the opening goes out as continuation-tts wrote it.
    expect(inner.pushes[0]).toBe('<emotion value="sympathetic"/>Oh, I hear you. ');
    // Normalize live: markdown and shouted caps are fixed.
    expect(inner.pushes[1]).toContain('That is really a lot of money');
    expect(plans[0].summary.levers).toContain('phrasing:shadow');
  });

  it('keeps a soft start on the opening, then settles at the reply speed', async () => {
    const { inner } = await run(
      { SPEECH_DIRECTOR: 'live' },
      {
        raw: ["I'm so sorry for your loss. It has been a hard week."],
        pushes: [
          '<speed ratio="0.9"/><volume ratio="0.8"/>I\'m so sorry for your loss. ',
          '<speed ratio="1"/><volume ratio="1"/>It has been a hard week. ',
        ],
      }
    );
    // The reply's 0.97 composes with the soft start's 0.9: 0.87, not either alone.
    expect(inner.pushes[0]).toMatch(
      /^<speed ratio="0\.87"\/><volume ratio="0\.8"\/><emotion value="sympathetic"\/>/
    );
    expect(inner.pushes[1]).toMatch(/^<speed ratio="0\.97"\/><volume ratio="1"\/>It has been/);
  });

  it('smooths speed per session and never across sessions', async () => {
    const sessions = new DirectorSessions();
    const heavy = {
      raw: ["I'm so sorry for your loss."],
      pushes: ["I'm so sorry for your loss. "],
    };
    const neutral = { raw: ['The meeting is Tuesday.'], pushes: ['The meeting is Tuesday. '] };
    const a1 = await run({ SPEECH_DIRECTOR: 'live' }, { sessionId: 'a', sessions, ...heavy });
    const a2 = await run({ SPEECH_DIRECTOR: 'live' }, { sessionId: 'a', sessions, ...heavy });
    const b1 = await run({ SPEECH_DIRECTOR: 'live' }, { sessionId: 'b', sessions, ...neutral });
    expect(a1.plans[0].summary.speed).toBe(0.97);
    expect(a2.plans[0].summary.speed).toBeLessThan(0.97);
    expect(b1.plans[0].summary.speed).toBe(1);
    expect(b1.inner.pushes[0]).not.toContain('<speed');
  });

  it('holds a push ending in "..." and joins it to the next when the sentence goes on', async () => {
    const raw = ["Oh wow, that's just... huge news for you. ", 'And then... I left.'];
    const pushes = ["Oh wow, that's just... ", 'huge news for you. ', 'And then... I left. '];
    const live = await run({ SPEECH_DIRECTOR: 'live' }, { raw, pushes });
    expect(live.inner.pushes.join('')).toContain("Oh wow, that's just huge news for you.");
    // A trailing-off before a new sentence ("then... I") is kept.
    expect(live.inner.pushes.join('')).toContain('And then... I left.');
    expect(live.plans[0].summary.ellipsesRemoved).toBe(1);

    const shadow = await run({ SPEECH_DIRECTOR: 'shadow' }, { raw, pushes });
    expect(shadow.inner.pushes).toEqual(pushes);
    expect(shadow.plans[0].summary.ellipsesRemoved).toBe(1);
    expect(shadow.plans[0].summary.commasPer100Words).toBeGreaterThan(0);
  });

  it('logs the plan on cancel too, and cancels the inner reply', async () => {
    const inner = new Recorder();
    const plans: PlanSummary[] = [];
    const directed = directSpeech(inner, {
      textStream: new ReadableStream<string>(),
      voiceId: VOICE,
      env: { SPEECH_DIRECTOR: 'live' },
      sessions: new DirectorSessions(),
      onPlan: (s) => plans.push(s),
    });
    directed.reply.push('Hello there, how are you doing today. ');
    directed.reply.cancel();
    directed.reply.end();
    expect(inner.cancelled).toBe(true);
    expect(plans).toHaveLength(1);
    expect(plans[0].cancelled).toBe(true);
  });
});
