/**
 * The laughter lever (SPEECH_DIRECTOR_LAUGHTER=off|shadow|live, opt-in).
 * `[laughter]` is the one nonverbal Cartesia documents. The Director reuses
 * the existing decision rules (speech/adaptive-ssml/contextual-laughter.ts
 * decideLaughter: no laughter on heavy topics, a distressed user or a
 * supportive reply; persona probabilities; turn cooldowns) once per reply,
 * and may only ADD `[laughter]` at a phrase boundary, never during a heavy
 * reply, at most once per reply.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

class Recorder implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

const LIVE = { SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_LAUGHTER: 'live' };
const TEASE = ["I'm just teasing you, you know that. ", 'Anyway, how was the weekend?'];
let sid = 0;

async function reply(
  pushes: string[],
  env: Record<string, string>,
  opts: {
    personaId?: string;
    comfortLevel?: number;
    turn?: number;
    sessionId?: string;
    sessions?: DirectorSessions;
  } = {}
) {
  const inner = new Recorder();
  let summary: PlanSummary | undefined;
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(pushes.join(''));
        c.close();
      },
    }),
    voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    sessionId: opts.sessionId ?? `laugh-${++sid}`,
    personaId: opts.personaId ?? 'jordan-taylor',
    turnContext: { turnNumber: opts.turn ?? 10, userRequest: 'haha that was a good one' },
    comfortLevel: opts.comfortLevel ?? 1,
    env,
    sessions: opts.sessions ?? new DirectorSessions(),
    onPlan: (s) => (summary = s),
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const p of pushes) directed.reply.push(p);
  directed.reply.end();
  return { pushes: inner.pushes, all: inner.pushes.join(''), summary: summary! };
}

const count = (text: string): number => (text.match(/\[laughter\]/g) ?? []).length;

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0); // every roll passes
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('laughter lever', () => {
  it('live: adds one [laughter] at a phrase boundary when the rules allow', async () => {
    const { pushes, all, summary } = await reply(TEASE, LIVE);
    expect(count(all)).toBe(1);
    // At a boundary: it ends a push or starts one, never splits words.
    expect(pushes.some((p) => /\[laughter\] $/.test(p) || /^\[laughter\] /.test(p))).toBe(true);
    const words = (t: string): string => t.replace(/\s+/g, ' ').trim();
    expect(words(all.replace('[laughter]', ''))).toBe(words(TEASE.join('')));
    expect(summary.laughter).toBeDefined();
  });

  it('is opt-in: nothing with SPEECH_DIRECTOR=live alone', async () => {
    const { all } = await reply(TEASE, { SPEECH_DIRECTOR: 'live' });
    expect(count(all)).toBe(0);
  });

  it('shadow: decides and logs, adds nothing', async () => {
    const { all, summary } = await reply(TEASE, {
      SPEECH_DIRECTOR: 'live',
      SPEECH_DIRECTOR_LAUGHTER: 'shadow',
    });
    expect(count(all)).toBe(0);
    expect(summary.laughter).toBeDefined();
  });

  it('never during a heavy reply', async () => {
    const heavy = ["I'm so sorry, that sounds really hard. ", "I'm just teasing you though."];
    const { all, summary } = await reply(heavy, LIVE);
    expect(count(all)).toBe(0);
    expect(summary.laughter).toBeUndefined();
  });

  it('at most one per reply: an LLM-authored [laughter] gets no company', async () => {
    const authored = ["[laughter] I'm just teasing you, you know that. ", 'Anyway.'];
    const { all } = await reply(authored, LIVE);
    expect(count(all)).toBe(1);
  });

  it("keeps the rules' turn cooldown across replies in a session", async () => {
    const sessionId = `laugh-cooldown-${++sid}`;
    const sessions = new DirectorSessions();
    const first = await reply(TEASE, LIVE, { sessionId, sessions, turn: 20 });
    const second = await reply(TEASE, LIVE, { sessionId, sessions, turn: 21 });
    expect(count(first.all)).toBe(1);
    expect(count(second.all)).toBe(0);
    // Ending the session forgets the laugh history.
    sessions.clear(sessionId);
    const third = await reply(TEASE, LIVE, { sessionId, sessions, turn: 22 });
    expect(count(third.all)).toBe(1);
  });

  it("Ferni's own tuning keeps her from laughing at the default comfort (finding)", async () => {
    // contextual-laughter: confidence = pattern x 0.18 (Ferni) x (comfort + 0.5),
    // below its 0.3 floor even with every roll passing.
    const { all } = await reply(TEASE, LIVE, { personaId: 'ferni', comfortLevel: undefined });
    expect(count(all)).toBe(0);
  });
});
