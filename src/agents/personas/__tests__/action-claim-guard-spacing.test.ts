/**
 * Live call 2026-10-17: stored and spoken replies read "cr ickets", "I' m",
 * "don' t", "Fern i here", "actually ." The Google plugin sends a usage-only
 * chunk ({ id, usage }, no delta) after every streamed Gemini response chunk.
 * The claim guard treated any chunk without text as a tool call, flushed the
 * half-word it was holding, and spaced the next piece off it.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { withActionClaimCheck } from '../action-claim-guard.js';

const text = (content: string): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
});
const usage = { id: 'r', usage: { completionTokens: 3, promptTokens: 9 } } as llm.ChatChunk;

/** Gemini's pieces split mid-word, each followed by its usage chunk, as the plugin emits them. */
function geminiStream(...pieces: string[]): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      for (const p of pieces) {
        c.enqueue(text(p));
        c.enqueue(usage);
      }
      c.close();
    },
  });
}

async function spoken(stream: ReadableStream<llm.ChatChunk>, env: Record<string, string>) {
  const out = await withActionClaimCheck(Promise.resolve(stream), { items: [] }, {}, undefined, env);
  let said = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>)
    said += c.delta?.content ?? '';
  return said;
}

const PIECES = [
  "I'm doing well. Just listening to the cr",
  "ickets outside. I'",
  'm glad, actually',
  '. Fern',
  'i here, with thirty',
  "-second previews, and I don'",
  't mind.',
];
const SAID = PIECES.join('');

describe('claim guard keeps words whole across usage chunks', () => {
  it.each([
    ['held (ACTION_CLAIM_STREAM off, the prod default)', {}],
    ['streamed', { ACTION_CLAIM_STREAM: 'on' }],
  ])('%s', async (_name, env) => {
    expect(await spoken(geminiStream(...PIECES), { ACTION_CLAIM_GUARD: 'on', ...env })).toBe(SAID);
  });

  it('still passes the usage chunks through', async () => {
    const out = await withActionClaimCheck(
      Promise.resolve(geminiStream('Hi there.')),
      { items: [] },
      {},
      undefined,
      { ACTION_CLAIM_GUARD: 'on' }
    );
    const chunks: llm.ChatChunk[] = [];
    for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) chunks.push(c);
    expect(chunks.filter((c) => c.usage)).toHaveLength(1);
  });
});
