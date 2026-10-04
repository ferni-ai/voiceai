import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { createInterruptAwareTransform, SOFT_START_END } from '../speech-wrapper.js';

async function through(pieces: string[], wasInterrupted: boolean): Promise<string> {
  const input = new ReadableStream<string>({
    start(c) {
      for (const p of pieces) c.enqueue(p);
      c.close();
    },
  });
  const out = input.pipeThrough(
    createInterruptAwareTransform({
      wasInterrupted,
      interruptType: 'soft',
      personaId: 'ferni',
      sessionId: 'test-soft-start',
    }) as never
  ) as unknown as AsyncIterable<string>;
  let text = '';
  for await (const chunk of out) text += chunk;
  return text;
}

describe('interrupt soft start', () => {
  it('ends the soft start after the first sentence of the reply', async () => {
    const text = await through(['Go ahead. ', 'I was just saying it sounds like a lot.'], true);
    const end = text.indexOf(SOFT_START_END);
    expect(end).toBeGreaterThan(text.indexOf('Go ahead.'));
    expect(end).toBeLessThan(text.indexOf('I was just saying'));
  });

  it('adds nothing when the reply did not follow an interruption', async () => {
    const text = await through(['Go ahead. ', 'I was just saying it sounds like a lot.'], false);
    expect(text).not.toContain(SOFT_START_END);
  });
});
