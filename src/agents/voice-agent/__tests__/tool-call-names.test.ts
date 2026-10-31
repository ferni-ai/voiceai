/**
 * Tool names reach their listeners from every chunk of a reply, while the
 * "a tool was asked for" signal stays once per reply (the watchdogs' tool hold).
 */
import { ReadableStream, WritableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';
import { tapToolCalls } from '../../personas/turn-request.js';
import { onToolCallRequested, onToolNamesRequested } from '../empty-response-watchdog.js';

const toolChunk = (...names: string[]) => ({
  id: names.join(','),
  delta: { toolCalls: names.map((name) => ({ type: 'function_call', name })) },
});

async function tap(session: object, chunks: object[]): Promise<void> {
  const reply = new ReadableStream<object>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  await tapToolCalls(reply, session)?.pipeTo(new WritableStream());
}

describe('tool names from every chunk', () => {
  it('a later chunk with a new tool reports its name; the tool signal stays once', async () => {
    const session = {};
    const started = vi.fn();
    const names: string[][] = [];
    onToolCallRequested(session, started);
    onToolNamesRequested(session, (n) => names.push([...n]));
    await tap(session, [
      toolChunk('getContactInfo'),
      { id: 't', delta: { content: 'hm' } },
      toolChunk('endCall'),
      toolChunk('endCall'),
    ]);
    expect(started).toHaveBeenCalledTimes(1);
    expect(names).toEqual([['getContactInfo'], ['endCall']]);
  });

  it('a reply with no tool call reports nothing', async () => {
    const session = {};
    const names = vi.fn();
    onToolNamesRequested(session, names);
    await tap(session, [{ id: 't', delta: { content: 'just words' } }]);
    expect(names).not.toHaveBeenCalled();
  });
});
