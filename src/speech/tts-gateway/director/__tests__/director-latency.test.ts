/**
 * Latency budget: the Director may add at most 20 ms per reply at p95
 * (spec §5.5). Measures the Director's own work per reply (the latencyUs it
 * reports, summed over every push and the final flush) across a fixed corpus
 * of realistic replies run in live mode with every lever on.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { findChunkEnd } from '../../chunk-boundary.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const BUDGET_P95_US = 20_000;

const CORPUS = [
  '<emotion value="sympathetic"/>Oh, I hear you. That sounds really hard, and honestly it makes sense that you\'re tired after everything that happened with your mom this week. Do you want to talk about it, or would it help more to just sit with it for a minute?',
  'Congratulations! That is amazing news. You worked for that promotion for two years, and the raise to $85,000 is a big deal. When do you start the new role, on 11/1?',
  "Well I think the simplest plan is this: wake up at 6:30 a.m., walk for 20 minutes, then eat before 8. Here's the thing, you don't need to do all of it on day one.",
  'Mrs. Patel said the appointment moved to Oct. 14th at 3pm, so you have about 12 days, approx. two weeks, to get the forms in. Call 555-201-4477 if anything changes.',
  "Hmm, that's a good question. The market was down about 2.5% in 1998 but it recovered, and honestly nobody can promise what happens next. What matters more is whether you can leave it alone for ten years or more.",
  "Yeah. I know you wanted to go to the party with all of them but you stayed home and that was the right call for you. [sighs] It doesn't always feel like it in the moment.",
];

class Sink implements ReplyStream {
  push(): void {}
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

/** The pushes continuation-tts would make: its own cut points over the raw text. */
function continuationPushes(raw: string): string[] {
  const pushes: string[] = [];
  let buffer = raw;
  let end: number | null;
  let first = true;
  while ((end = findChunkEnd(buffer, first ? 20 : 15)) !== null) {
    pushes.push(
      `${buffer
        .slice(0, end)
        .replace(/<[^>]+>|\[[^\]]+\]/g, '')
        .trim()} `
    );
    buffer = buffer.slice(end);
    first = false;
  }
  if (buffer.trim()) pushes.push(`${buffer.replace(/<[^>]+>|\[[^\]]+\]/g, '').trim()} `);
  return pushes;
}

async function directOnce(
  raw: string,
  sessions: DirectorSessions,
  sessionId: string
): Promise<number> {
  let summary: PlanSummary | undefined;
  const directed = directSpeech(new Sink(), {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(raw);
        c.close();
      },
    }),
    voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    sessionId,
    env: { SPEECH_DIRECTOR: 'live' },
    sessions,
    onPlan: (s) => (summary = s),
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const push of continuationPushes(raw)) directed.reply.push(push);
  directed.reply.end();
  return summary!.latencyUs;
}

describe('Speech Director latency', () => {
  it(`stays under ${BUDGET_P95_US / 1000} ms per reply at p95`, async () => {
    const sessions = new DirectorSessions();
    const samples: number[] = [];
    for (let i = 0; i < 300; i++) {
      samples.push(await directOnce(CORPUS[i % CORPUS.length], sessions, `bench-${i % 7}`));
    }
    samples.sort((a, b) => a - b);
    const pct = (p: number) =>
      samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
    const p50 = pct(0.5);
    const p95 = pct(0.95);
    const max = samples.at(-1)!;
    // Printed so the PR can quote measured numbers.
    process.stdout.write(
      `[director-latency] n=${samples.length} p50=${p50}us p95=${p95}us max=${max}us\n`
    );
    expect(samples[0]).toBeGreaterThan(0);
    expect(p95).toBeLessThanOrEqual(BUDGET_P95_US);
  });
});
