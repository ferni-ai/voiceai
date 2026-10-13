/**
 * OUTPUT_QUEUE_MS reaches session.start() as outputOptions.queueSizeMs; unset
 * (or junk) leaves the start options exactly as before, so the SDK default holds.
 */
import { describe, expect, it } from 'vitest';
import { OUTPUT_QUEUE_MS_RANGE, outputQueueMs, roomOutputOptions } from '../room-output-options.js';

describe('outputQueueMs', () => {
  it('is undefined when unset or empty: the SDK default', () => {
    expect(outputQueueMs({})).toBeUndefined();
    expect(outputQueueMs({ OUTPUT_QUEUE_MS: '' })).toBeUndefined();
    expect(outputQueueMs({ OUTPUT_QUEUE_MS: '  ' })).toBeUndefined();
  });

  it('takes a whole number of ms in range', () => {
    expect(outputQueueMs({ OUTPUT_QUEUE_MS: '200' })).toBe(200);
    expect(outputQueueMs({ OUTPUT_QUEUE_MS: ' 200 ' })).toBe(200);
    expect(outputQueueMs({ OUTPUT_QUEUE_MS: String(OUTPUT_QUEUE_MS_RANGE.min) })).toBe(10);
    expect(outputQueueMs({ OUTPUT_QUEUE_MS: String(OUTPUT_QUEUE_MS_RANGE.max) })).toBe(1000);
  });

  it('ignores junk, fractions and values out of range', () => {
    for (const bad of ['0', '9', '1001', '-200', '200.5', 'off', '200ms', 'NaN']) {
      expect(outputQueueMs({ OUTPUT_QUEUE_MS: bad }), bad).toBeUndefined();
    }
  });
});

describe('roomOutputOptions', () => {
  it('adds nothing to session.start() when unset', () => {
    expect(roomOutputOptions({})).toEqual({});
    expect(roomOutputOptions({ OUTPUT_QUEUE_MS: 'junk' })).toEqual({});
  });

  it('passes the queue size as the room output queueSizeMs', () => {
    expect(roomOutputOptions({ OUTPUT_QUEUE_MS: '200' })).toEqual({
      outputOptions: { queueSizeMs: 200 },
    });
  });
});
