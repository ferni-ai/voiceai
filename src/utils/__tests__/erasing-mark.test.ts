import { describe, expect, it } from 'vitest';
import { erasingMark, isErasedOrErasing } from '../erasing-mark.js';

const snap = (data: object | undefined) => ({ exists: data !== undefined, data: () => data });

describe('erasing mark', () => {
  it('a missing record is erased', () => {
    expect(isErasedOrErasing(snap(undefined))).toBe(true);
  });

  it('a record the erasure marked is erasing', () => {
    expect(isErasedOrErasing(snap({ id: 'u-1', ...erasingMark(new Date(0)) }))).toBe(true);
    expect(erasingMark(new Date(0))).toEqual({
      erasing: true,
      erasingAt: '1970-01-01T00:00:00.000Z',
    });
  });

  it('a record with no mark, or any other value, is not', () => {
    expect(isErasedOrErasing(snap({ id: 'u-1' }))).toBe(false);
    expect(isErasedOrErasing(snap({ id: 'u-1', erasing: 'yes' }))).toBe(false);
  });
});
