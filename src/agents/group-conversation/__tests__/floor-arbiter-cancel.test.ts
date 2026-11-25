/**
 * floorArbiter (floor-arbiter.ts) on cancel: it never waits on its input, and a
 * read still pending at cancel settles into nothing, with no error logged.
 */
import { stt } from '@livekit/agents';
import { ReadableStreamDefaultController } from 'node:stream/web';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { floorArbiter, type PersonSpeechEvent } from '../floor-arbiter.js';
import { ALEX, said, tick } from './person-speech-events.js';

const logged = vi.hoisted(() => ({ error: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ ...logged, info: vi.fn(), warn: vi.fn() }),
}));

const { START_OF_SPEECH, FINAL_TRANSCRIPT } = stt.SpeechEventType;

beforeEach(() => {
  logged.error.mockClear();
  logged.debug.mockClear();
});

describe('floorArbiter cancel', () => {
  it.each([
    ['an event', true],
    ['the end of input', false],
  ])(
    'cancel does not wait on a pending read, and a late read of %s is ignored',
    async (_late, yieldsLate) => {
      const enqueue = vi.spyOn(ReadableStreamDefaultController.prototype, 'enqueue');
      const close = vi.spyOn(ReadableStreamDefaultController.prototype, 'close');
      let release = (): void => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      async function* blocked(): AsyncGenerator<PersonSpeechEvent> {
        yield said(ALEX, START_OF_SPEECH);
        await gate;
        if (yieldsLate) yield said(ALEX, FINAL_TRANSCRIPT, 'too late');
      }

      try {
        const reader = floorArbiter({}, blocked()).getReader();
        expect((await reader.read()).value?.type).toBe(START_OF_SPEECH);
        await tick(5); // the stream has asked for the next event, which waits on the gate

        const cancelled = reader.cancel('hang up').then(() => 'resolved');
        const settled = await Promise.race([cancelled, tick(50).then(() => 'still waiting')]);
        expect(settled).toBe('resolved');
        const callsAtCancel = enqueue.mock.calls.length + close.mock.calls.length;

        release();
        await tick(10);
        expect(enqueue.mock.calls.length + close.mock.calls.length).toBe(callsAtCancel);
        expect(logged.error).not.toHaveBeenCalled();
      } finally {
        enqueue.mockRestore();
        close.mockRestore();
      }
    }
  );

  it('a read that fails after cancel is not logged as an error', async () => {
    let fail = (_error: Error): void => {};
    const pending = new Promise<IteratorResult<PersonSpeechEvent>>((_resolve, reject) => {
      fail = reject;
    });
    let reads = 0;
    const input: AsyncIterable<PersonSpeechEvent> = {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          reads += 1;
          return reads === 1
            ? Promise.resolve({ done: false, value: said(ALEX, START_OF_SPEECH) })
            : pending;
        },
        return: () => Promise.resolve({ done: true, value: undefined }),
      }),
    };

    const reader = floorArbiter({}, input).getReader();
    await reader.read();
    await tick(5);
    await reader.cancel('hang up');

    fail(new Error('socket closed on hang up'));
    await tick(10);
    expect(logged.error).not.toHaveBeenCalled();
    expect(logged.debug).toHaveBeenCalled();
  });
});
