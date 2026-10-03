/**
 * Review H1 (part 1): continuation-tts's tag contract is changing (PR #171
 * puts a base-relative <speed> on every sentence and can shift emotion
 * mid-reply). The Director must compose with an incoming speed, never
 * overwrite it, and with the emotion lever live keep one emotion per reply.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { composeSpeed } from '../engine.js';
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

/** Pace-matched pushes: every sentence carries a speed, one shifts emotion. */
const PUSHES = [
  '<speed ratio="1.1"/><emotion value="sympathetic"/>I\'m so sorry for your loss. ',
  '<speed ratio="1.1"/>Take all the time you need. ',
  '<speed ratio="1.1"/><emotion value="sad"/>It still hurts, I know. ',
  '<speed ratio="1.1"/>And that is okay. ',
];

async function run(env: Record<string, string>) {
  const inner = new Recorder();
  let summary: PlanSummary | undefined;
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(PUSHES.join(''));
        c.close();
      },
    }),
    voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    sessionId: 'tags',
    personaId: 'ferni',
    env,
    sessions: new DirectorSessions(),
    onPlan: (s) => (summary = s),
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const p of PUSHES) directed.reply.push(p);
  directed.reply.end();
  return { pushes: inner.pushes, summary: summary! };
}

const speedOf = (push: string): number | undefined => {
  const m = /^(?:<[^>]+>)*?<speed ratio="([\d.]+)"\/>/.exec(push);
  return m ? Number(m[1]) : undefined;
};

describe('composeSpeed', () => {
  it('multiplies and clamps to 0.6-1.5', () => {
    expect(composeSpeed(1.1, 0.97)).toBe(1.07);
    expect(composeSpeed(0.9, 0.97)).toBe(0.87);
    expect(composeSpeed(1.4, 1.2)).toBe(1.5);
    expect(composeSpeed(0.5, 0.9)).toBe(0.6);
  });
});

describe('pace-matched pushes with every lever live', () => {
  it("scales each sentence's own speed by the reply speed instead of replacing it", async () => {
    const { pushes, summary } = await run({ SPEECH_DIRECTOR: 'live' });
    expect(summary.speed).toBe(0.97);
    expect(pushes).toHaveLength(PUSHES.length);
    for (const push of pushes) expect(speedOf(push)).toBe(1.07);
  });

  it('keeps one emotion for the whole reply: the opening one', async () => {
    const { pushes } = await run({ SPEECH_DIRECTOR: 'live' });
    const emotions = pushes.flatMap((p) => p.match(/<emotion value="[a-z_]+"\/>/g) ?? []);
    expect(emotions).toEqual(['<emotion value="sympathetic"/>']);
    expect(pushes[0]).toContain('<emotion value="sympathetic"/>');
    // The words are all still there.
    expect(pushes[2]).toContain('It still hurts, I know.');
  });
});

describe('levers that are not live leave the tags alone', () => {
  it('passes a later emotion through when the emotion lever is off', async () => {
    const { pushes } = await run({ SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_EMOTION: 'off' });
    expect(pushes.join('')).toContain('<emotion value="sad"/>');
  });

  it('passes every speed through untouched when the pacing lever is off', async () => {
    const { pushes } = await run({ SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_PACING: 'off' });
    for (const push of pushes) expect(speedOf(push)).toBe(1.1);
  });
});
