/**
 * The opening breath/sigh decision (SPEECH_DIRECTOR_NONVERBAL=off|shadow|live,
 * opt-in, default off). Cartesia has no breath or sigh, so the Director
 * decides and Stage 2 renders it before the first word:
 * - sigh: the reply opens with a sigh cue (*sighs*, [sigh], the behavior
 *   tool's "Ahh."), or the reply AND the user's turn are both heavy;
 * - breath: the first sentence is long, or the user's turn was long;
 * - never both; a session gets at most one sigh per 4 replies and one breath
 *   per 3; the sigh cue's text never reaches Cartesia.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it } from 'vitest';

import { LESTER_PRO_V3_VOICE_ID } from '../../../../config/voice-ids.js';
import { clearReplyAudioPlan, takeReplyAudioPlan } from '../../../reply-audio-plan.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { createSSMLProcessor } from '../../ssml/processor.js';
import { leverModes } from '../gate.js';
import { decideOpening, type OpeningInput } from '../nonverbal.js';
import { RawCues } from '../raw-cues.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const INSTANT_CLONE = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';
const LONG_SENTENCE =
  'So what I would really like us to try this week is one small thing that you can keep doing every single morning.';
const LONG_USER_TURN = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');

const base = (over: Partial<OpeningInput> = {}): OpeningInput => ({
  openingText: 'Okay, that makes sense.',
  opensWithSigh: false,
  voiceId: LESTER_PRO_V3_VOICE_ID,
  carry: {},
  ...over,
});

describe('decideOpening', () => {
  it('sighs when the reply opens with a sigh cue, in the speaker’s pitch', () => {
    const d = decideOpening(base({ opensWithSigh: true }));
    expect(d.opening?.kind).toBe('sigh');
    expect(d.opening?.intensity).toBeGreaterThanOrEqual(0.5);
    expect(d.opening?.intensity).toBeLessThanOrEqual(0.7);
    expect(d.opening?.f0Hz).toBe(111);
    expect(decideOpening(base({ opensWithSigh: true, voiceId: INSTANT_CLONE })).opening).toEqual({
      kind: 'sigh',
      intensity: d.opening?.intensity,
    });
  });

  it('sighs on a heavy reply only after a heavy user turn', () => {
    const heavyReply = "I'm so sorry. That is a lot to carry.";
    expect(
      decideOpening(base({ openingText: heavyReply, userText: 'my dad died last week' })).opening
        ?.kind
    ).toBe('sigh');
    expect(
      decideOpening(base({ openingText: heavyReply, userText: 'can you set a timer' })).opening
    ).toBeUndefined();
    expect(
      decideOpening(base({ openingText: 'Nice!', userText: 'my dad died last week' })).opening
    ).toBeUndefined();
  });

  it('breathes before a long first sentence or after a long user turn', () => {
    expect(decideOpening(base({ openingText: LONG_SENTENCE })).opening?.kind).toBe('breath');
    expect(decideOpening(base({ userText: LONG_USER_TURN })).opening?.kind).toBe('breath');
    const short = decideOpening(base({ userText: 'hi there' }));
    expect(short.opening).toBeUndefined();
    const breath = decideOpening(base({ openingText: LONG_SENTENCE })).opening;
    expect(breath?.intensity).toBeGreaterThanOrEqual(0.5);
    expect(breath?.intensity).toBeLessThanOrEqual(0.7);
  });

  it('never both: a sigh wins over a breath', () => {
    const d = decideOpening(base({ opensWithSigh: true, openingText: LONG_SENTENCE }));
    expect(d.opening?.kind).toBe('sigh');
  });

  it('cools down: one sigh per 4 replies, one breath per 3', () => {
    expect(decideOpening(base({ opensWithSigh: true, carry: { sinceSigh: 2 } })).opening).toBe(
      undefined
    );
    expect(
      decideOpening(base({ opensWithSigh: true, carry: { sinceSigh: 3 } })).opening?.kind
    ).toBe('sigh');
    expect(
      decideOpening(base({ openingText: LONG_SENTENCE, carry: { sinceBreath: 1 } })).opening
    ).toBeUndefined();
    expect(
      decideOpening(base({ openingText: LONG_SENTENCE, carry: { sinceBreath: 2 } })).opening?.kind
    ).toBe('breath');
  });
});

describe('the nonverbal lever is opt-in', () => {
  it('stays off under SPEECH_DIRECTOR=live unless set, and never exceeds the global mode', () => {
    expect(leverModes({ SPEECH_DIRECTOR: 'live' }).nonverbal).toBe('off');
    expect(
      leverModes({ SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_NONVERBAL: 'live' }).nonverbal
    ).toBe('live');
    expect(
      leverModes({ SPEECH_DIRECTOR: 'shadow', SPEECH_DIRECTOR_NONVERBAL: 'live' }).nonverbal
    ).toBe('shadow');
  });
});

describe('RawCues: does the reply open with a sigh?', () => {
  const opens = (...chunks: string[]): boolean => {
    const cues = new RawCues();
    for (const c of chunks) cues.see(c);
    return cues.opensWithSigh;
  };
  it('reads the LLM cue forms and the behavior tool output at the start only', () => {
    expect(opens('*sighs* Okay.')).toBe(true);
    expect(opens('[sigh] ', 'Okay.')).toBe(true);
    expect(opens('<emotion value="sympathetic"/>(sighs) Okay.')).toBe(true);
    expect(
      opens('<break time="300ms"/><emotion value="gentle"/>Ahh.<break time="400ms"/>Okay.')
    ).toBe(true);
    expect(opens('Okay. *sighs* Fine.')).toBe(false);
    expect(opens('Ahh, I see.')).toBe(false);
  });
});

// ---- Through the Director on its push path ----

class Recorder implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

const SESSION = 'nonverbal-session';
const processor = createSSMLProcessor();
/** What continuation-tts would push for this raw text (one sanitized piece). */
const sanitize = (raw: string): string => `${processor.parse(raw).cleanText} `;

async function reply(
  raw: string[],
  env: Record<string, string>,
  sessions = new DirectorSessions(),
  turn = 5,
  userRequest?: string
) {
  const inner = new Recorder();
  let summary: PlanSummary | undefined;
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        for (const r of raw) c.enqueue(r);
        c.close();
      },
    }),
    voiceId: LESTER_PRO_V3_VOICE_ID,
    sessionId: SESSION,
    personaId: 'ferni',
    turnContext: { turnNumber: turn, userRequest },
    replyId: String(turn),
    env,
    sessions,
    onPlan: (s) => (summary = s),
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const r of raw) {
    const piece = sanitize(r);
    if (piece.trim()) directed.reply.push(piece);
  }
  directed.reply.end();
  return {
    pushes: inner.pushes,
    summary: summary!,
    plan: takeReplyAudioPlan(SESSION, String(turn)),
  };
}

const LIVE = { SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_NONVERBAL: 'live' };

afterEach(() => clearReplyAudioPlan(SESSION));

describe('Director nonverbal lever on the push path', () => {
  it('live: plans a sigh at Lester’s pitch for this turn, and no cue text is pushed', async () => {
    const { pushes, plan, summary } = await reply(
      ["*sighs* I'm so sorry. ", 'That is a lot to carry.'],
      LIVE
    );
    expect(plan?.opening).toEqual({ kind: 'sigh', intensity: 0.6, f0Hz: 111 });
    expect(summary.opening).toBe('sigh');
    expect(pushes.join('')).not.toMatch(/sigh/i);
  });

  it('live: the behavior tool’s sigh is rendered, its "Ahh." never spoken', async () => {
    const raw = [
      '<break time="300ms"/><emotion value="gentle"/>Ahh.<break time="400ms"/>',
      'I hear you. That sounds exhausting.',
    ];
    const { pushes, plan } = await reply(raw, LIVE);
    expect(plan?.opening?.kind).toBe('sigh');
    expect(pushes.join('')).not.toMatch(/ahh/i);
    expect(pushes.join('')).toContain('I hear you.');
    // Lever off: exactly what the default path sends today.
    const off = await reply(raw, { SPEECH_DIRECTOR: 'live' });
    expect(off.pushes.join('')).toMatch(/^Ahh\./);
    expect(off.plan?.opening).toBeUndefined();
  });

  it('is opt-in: SPEECH_DIRECTOR=live alone plans no opening', async () => {
    const { plan } = await reply(["*sighs* I'm so sorry. "], { SPEECH_DIRECTOR: 'live' });
    expect(plan?.opening).toBeUndefined();
  });

  it('shadow: decides and logs, plans nothing', async () => {
    const { plan, summary } = await reply(["*sighs* I'm so sorry. "], {
      SPEECH_DIRECTOR: 'live',
      SPEECH_DIRECTOR_NONVERBAL: 'shadow',
    });
    expect(summary.opening).toBe('sigh');
    expect(plan?.opening).toBeUndefined();
  });

  it('a session gets at most one sigh in any 4 replies', async () => {
    const sessions = new DirectorSessions();
    const kinds: Array<string | undefined> = [];
    for (let turn = 1; turn <= 8; turn++) {
      const { plan } = await reply(["*sighs* I'm so sorry. "], LIVE, sessions, turn);
      kinds.push(plan?.opening?.kind);
    }
    expect(kinds).toEqual([
      'sigh',
      undefined,
      undefined,
      undefined,
      'sigh',
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('breathes after a long user turn', async () => {
    const { plan } = await reply(['Okay, let us start there.'], LIVE, undefined, 5, LONG_USER_TURN);
    expect(plan?.opening).toEqual({ kind: 'breath', intensity: 0.5 });
  });
});
