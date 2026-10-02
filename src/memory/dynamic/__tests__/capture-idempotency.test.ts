/**
 * Capturing the same utterance twice in a turn (transcript handler plus the
 * TURN_INTELLIGENCE turn handler) must not queue two extraction jobs or record
 * two STM turns.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../async-events-config.js', () => ({
  safeEmitEvent: vi.fn(() => true),
  safeOnEvent: vi.fn(() => true),
}));

import * as asyncEvents from '../async-events-config.js';
import { CaptureDedupe, captureKey } from '../capture-dedupe.js';
import { fastCapture, resetCaptureDedupe } from '../fast-capture.js';
import { clearAllSTMBuffers, getRecentTurns, recordTurn } from '../stm-buffer.js';

const input = {
  userId: 'u1',
  sessionId: 's1',
  turnNumber: 0,
  transcript: 'My sister Emma is moving to Denver next month for her new job.',
  conversationId: 'conv-1',
};

beforeEach(() => {
  resetCaptureDedupe();
  clearAllSTMBuffers();
  (asyncEvents.safeEmitEvent as Mock).mockClear();
});

describe('fastCapture idempotency', () => {
  it('queues one extraction job when two paths capture the same utterance', async () => {
    const [a, b] = await Promise.all([
      fastCapture(input),
      fastCapture({ ...input, turnNumber: 7 }),
    ]);
    expect(asyncEvents.safeEmitEvent).toHaveBeenCalledTimes(1);
    expect(a.duplicate).toBeUndefined();
    expect(b.duplicate).toBe(true);
    expect(b.asyncJobId).toBe(a.asyncJobId);

    recordTurn('s1', 'u1', a, input.transcript, 0);
    recordTurn('s1', 'u1', b, input.transcript, 7);
    expect(getRecentTurns('s1')).toHaveLength(1);
  });

  it('passes the conversation id into the extraction job', async () => {
    await fastCapture(input);
    const [, payload] = (asyncEvents.safeEmitEvent as Mock).mock.calls[0];
    expect(payload).toMatchObject({ conversationId: 'conv-1', sessionId: 's1' });
  });

  it('treats the same words in two numbered turns as two turns', async () => {
    await fastCapture({ ...input, turnNumber: 3 });
    await fastCapture({ ...input, turnNumber: 4 });
    expect(asyncEvents.safeEmitEvent).toHaveBeenCalledTimes(2);
  });

  it('treats a different session or utterance as a new turn', async () => {
    await fastCapture(input);
    await fastCapture({ ...input, sessionId: 's2' });
    await fastCapture({
      ...input,
      transcript: 'My brother Jack is visiting from Boston next week.',
    });
    expect(asyncEvents.safeEmitEvent).toHaveBeenCalledTimes(3);
  });
});

describe('CaptureDedupe', () => {
  it('expires entries after the window', () => {
    let t = 0;
    const d = new CaptureDedupe<number>(1000, () => t);
    const key = captureKey('s', 'Hello there!');
    expect(captureKey('s', 'hello, there')).toBe(key);
    expect(d.claim(key, 1)).toBe(true);
    expect(d.claim(key, 2)).toBe(false);
    t = 1500;
    expect(d.claim(key, 3)).toBe(true);
    expect(d.get(key)).toBe(3);
  });
});
