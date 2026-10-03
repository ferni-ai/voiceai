import { Timestamp } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import { timestampsToDates } from '../index.js';

describe('timestampsToDates', () => {
  it('gives loaded data its Dates back, at any depth, so a later save does not fail', () => {
    const when = new Date('2026-10-02T22:15:00.000Z');
    const stored = {
      samples: [{ text: 'hey', timestamp: Timestamp.fromDate(when) }],
      updatedAt: '2026-10-02T22:15:00.000Z',
      count: 3,
    };
    const loaded = timestampsToDates(stored) as typeof stored & { samples: Array<{ timestamp: Date }> };
    expect(loaded.samples[0].timestamp).toBeInstanceOf(Date);
    expect(loaded.samples[0].timestamp.getTime()).toBe(when.getTime());
    expect(new Date(loaded.samples[0].timestamp).getTime()).toBe(when.getTime()); // what loaders do
    expect(loaded.updatedAt).toBe('2026-10-02T22:15:00.000Z'); // strings stay strings
    expect(loaded.count).toBe(3);
  });

  it('shows the bug it fixes: new Date(Timestamp) is an Invalid Date', () => {
    expect(Number.isNaN(new Date(Timestamp.now() as never).getTime())).toBe(true);
  });
});
