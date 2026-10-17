/**
 * A reply that opens with a said-by mark copied off a handoff's marked history
 * is cut before the TTS or the captions hear it (DIRECTOR_PERSONA_AWARE).
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropLeadingSaidBy, saidBy, splitSaidBy } from '../said-by.js';

type Chunk = string | llm.ChatChunk;

function streamOf<T extends Chunk>(chunks: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

async function collect<T extends Chunk>(stream: ReadableStream<T> | null): Promise<T[]> {
  const out: T[] = [];
  for await (const c of stream as unknown as AsyncIterable<T>) out.push(c);
  return out;
}

const textOf = (chunks: Chunk[]) =>
  chunks.map((c) => (typeof c === 'string' ? c : (c.delta?.content ?? ''))).join('');

const delta = (content: string): llm.ChatChunk =>
  ({ id: 'r1', delta: { role: 'assistant', content } }) as llm.ChatChunk;

afterEach(() => vi.unstubAllEnvs());

describe('dropLeadingSaidBy', () => {
  it('cuts a leading mark split across chunks', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const out = await collect(
      dropLeadingSaidBy(streamOf(['(Pe', 'ter said:', ') Coffee', ' spend!']))
    );
    expect(textOf(out)).toBe('Coffee spend!');
  });

  it('cuts it from chat chunks, keeping their other fields', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const out = await collect(dropLeadingSaidBy(streamOf([delta('(Ferni said:) Hi'), delta('.')])));
    expect(textOf(out)).toBe('Hi.');
    expect((out[0] as llm.ChatChunk).id).toBe('r1');
  });

  it('keeps a reply that opens with an ordinary aside in brackets', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const out = await collect(dropLeadingSaidBy(streamOf(['(Honestly) ', 'it went well.'])));
    expect(textOf(out)).toBe('(Honestly) it went well.');
  });

  it('keeps a mark that is not at the start', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const out = await collect(dropLeadingSaidBy(streamOf(['Well ', '(Ferni said:) hi'])));
    expect(textOf(out)).toBe('Well (Ferni said:) hi');
  });

  it('passes the reply through untouched with the flag off', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'off');
    const reply = streamOf(['(Peter said:) Coffee']);
    expect(dropLeadingSaidBy(reply)).toBe(reply);
  });
});

describe('saidBy and splitSaidBy', () => {
  it('round-trip a mark', () => {
    expect(splitSaidBy(`${saidBy('Ferni')}Hello there`)).toEqual({
      name: 'Ferni',
      text: 'Hello there',
    });
    expect(splitSaidBy('Hello there')).toBeUndefined();
  });
});
