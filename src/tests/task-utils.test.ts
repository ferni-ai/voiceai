/**
 * Task Utilities Tests
 *
 * Tests for common task utility functions:
 * - randomChoice: Select random element from array
 * - randomSample: Select multiple unique random elements
 * - clamp: Clamp values between bounds
 * - lerp: Linear interpolation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomChoice, randomSample, clamp, lerp } from '../tasks/utils.js';

describe('Task Utilities', () => {
  describe('randomChoice', () => {
    it('should return an element from the array', () => {
      const arr = ['a', 'b', 'c'];
      const result = randomChoice(arr);
      expect(arr).toContain(result);
    });

    it('should throw error for empty array', () => {
      expect(() => randomChoice([])).toThrow('Cannot select from empty array');
    });

    it('should return only element in single-element array', () => {
      const arr = ['only'];
      expect(randomChoice(arr)).toBe('only');
    });

    it('should work with number arrays', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = randomChoice(arr);
      expect(arr).toContain(result);
    });

    it('should work with object arrays', () => {
      const arr = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = randomChoice(arr);
      expect(arr).toContain(result);
    });

    it('should return different values over multiple calls (probabilistic)', () => {
      const arr = ['a', 'b', 'c', 'd', 'e'];
      const results = new Set<string>();

      // Run 100 times, should get at least 2 different values
      for (let i = 0; i < 100; i++) {
        results.add(randomChoice(arr));
      }

      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('randomSample', () => {
    it('should return the requested number of elements', () => {
      const arr = ['a', 'b', 'c', 'd', 'e'];
      const result = randomSample(arr, 3);
      expect(result).toHaveLength(3);
    });

    it('should return unique elements', () => {
      const arr = ['a', 'b', 'c', 'd', 'e'];
      const result = randomSample(arr, 4);
      const unique = new Set(result);
      expect(unique.size).toBe(4);
    });

    it('should return elements from the original array', () => {
      const arr = ['a', 'b', 'c', 'd', 'e'];
      const result = randomSample(arr, 3);
      result.forEach((item) => {
        expect(arr).toContain(item);
      });
    });

    it('should throw when count exceeds array length', () => {
      const arr = ['a', 'b', 'c'];
      expect(() => randomSample(arr, 5)).toThrow('Cannot select 5 items from array of length 3');
    });

    it('should return empty array when count is 0', () => {
      const arr = ['a', 'b', 'c'];
      const result = randomSample(arr, 0);
      expect(result).toHaveLength(0);
    });

    it('should return all elements when count equals array length', () => {
      const arr = ['a', 'b', 'c'];
      const result = randomSample(arr, 3);
      expect(result).toHaveLength(3);
      // All elements should be present (in some order)
      arr.forEach((item) => {
        expect(result).toContain(item);
      });
    });

    it('should not modify the original array', () => {
      const arr = ['a', 'b', 'c', 'd', 'e'];
      const arrCopy = [...arr];
      randomSample(arr, 3);
      expect(arr).toEqual(arrCopy);
    });

    it('should work with number arrays', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = randomSample(arr, 3);
      expect(result).toHaveLength(3);
      result.forEach((item) => {
        expect(arr).toContain(item);
      });
    });
  });

  describe('clamp', () => {
    it('should return value when within bounds', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should return min when value is below min', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should return max when value is above max', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should handle equal min and max', () => {
      expect(clamp(5, 5, 5)).toBe(5);
      expect(clamp(0, 5, 5)).toBe(5);
      expect(clamp(10, 5, 5)).toBe(5);
    });

    it('should handle negative bounds', () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
      expect(clamp(-15, -10, -1)).toBe(-10);
      expect(clamp(0, -10, -1)).toBe(-1);
    });

    it('should handle floating point numbers', () => {
      expect(clamp(0.5, 0, 1)).toBe(0.5);
      expect(clamp(-0.1, 0, 1)).toBe(0);
      expect(clamp(1.5, 0, 1)).toBe(1);
    });

    it('should handle edge values exactly at bounds', () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe('lerp', () => {
    it('should return start when t=0', () => {
      expect(lerp(10, 20, 0)).toBe(10);
    });

    it('should return end when t=1', () => {
      expect(lerp(10, 20, 1)).toBe(20);
    });

    it('should return midpoint when t=0.5', () => {
      expect(lerp(10, 20, 0.5)).toBe(15);
    });

    it('should interpolate correctly for arbitrary t', () => {
      expect(lerp(0, 100, 0.25)).toBe(25);
      expect(lerp(0, 100, 0.75)).toBe(75);
    });

    it('should handle negative values', () => {
      expect(lerp(-10, 10, 0.5)).toBe(0);
      expect(lerp(-20, -10, 0.5)).toBe(-15);
    });

    it('should clamp t to 0-1 range', () => {
      // t < 0 should be treated as 0
      expect(lerp(10, 20, -0.5)).toBe(10);
      // t > 1 should be treated as 1
      expect(lerp(10, 20, 1.5)).toBe(20);
    });

    it('should handle start > end (decreasing interpolation)', () => {
      expect(lerp(20, 10, 0.5)).toBe(15);
      expect(lerp(100, 0, 0.25)).toBe(75);
    });

    it('should handle equal start and end', () => {
      expect(lerp(10, 10, 0)).toBe(10);
      expect(lerp(10, 10, 0.5)).toBe(10);
      expect(lerp(10, 10, 1)).toBe(10);
    });

    it('should handle floating point precision', () => {
      const result = lerp(0, 1, 0.3);
      expect(result).toBeCloseTo(0.3, 10);
    });
  });
});
