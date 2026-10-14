import { describe, expect, it } from 'vitest';
import { createExpiringMarks } from '../expiring-marks.js';

describe('createExpiringMarks', () => {
  it('a mark counts until the TTL passes, then the key reads as not loaded', () => {
    let clock = 1_000;
    const marks = createExpiringMarks(60_000, () => clock);
    marks.add('u1');
    clock += 59_999;
    expect(marks.has('u1')).toBe(true);
    clock += 1;
    expect(marks.has('u1')).toBe(false);
  });

  it('delete and clear drop marks at once', () => {
    const marks = createExpiringMarks(60_000, () => 0);
    marks.add('a');
    marks.add('b');
    expect(marks.delete('a')).toBe(true);
    expect(marks.has('a')).toBe(false);
    marks.clear();
    expect(marks.has('b')).toBe(false);
  });
});
