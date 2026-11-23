import { describe, expect, it } from 'vitest';
import { frameRms, mixFrames } from '../audio-mix.js';

describe('mixFrames', () => {
  it('sums the samples of every frame', () => {
    const mixed = mixFrames([Int16Array.from([1000, -1000]), Int16Array.from([2000, -2000])]);
    expect(Array.from(mixed)).toEqual([3000, -3000]);
  });

  it('clips a loud sum to the int16 ceiling instead of wrapping', () => {
    const mixed = mixFrames([Int16Array.from([30000]), Int16Array.from([10000])]);
    expect(Array.from(mixed)).toEqual([32767]);
  });

  it('clips a loud negative sum to the int16 floor instead of wrapping', () => {
    const mixed = mixFrames([Int16Array.from([-30000]), Int16Array.from([-10000])]);
    expect(Array.from(mixed)).toEqual([-32768]);
  });

  it('throws on frames of unequal length', () => {
    expect(() => mixFrames([new Int16Array(160), new Int16Array(80)])).toThrow(/length/);
  });

  it('returns a copy of a single frame, not the frame itself', () => {
    const only = Int16Array.from([5, -5]);
    const mixed = mixFrames([only]);
    expect(Array.from(mixed)).toEqual([5, -5]);
    expect(mixed).not.toBe(only);
  });
});

describe('frameRms', () => {
  it('is 0 for silence', () => {
    expect(frameRms(new Int16Array(160))).toBe(0);
  });

  it('is the level of a constant frame', () => {
    expect(frameRms(new Int16Array(160).fill(1000))).toBe(1000);
  });

  it('is 0 for an empty frame', () => {
    expect(frameRms(new Int16Array(0))).toBe(0);
  });
});
