/**
 * Tests for session-manager/constants.ts
 */

import { describe, it, expect } from 'vitest';
import { parseDurationMs } from '../constants.js';

describe('parseDurationMs', () => {
  describe('with undefined/empty values', () => {
    it('returns default when value is undefined', () => {
      expect(parseDurationMs(undefined, 5000)).toBe(5000);
    });

    it('returns default when value is empty string', () => {
      expect(parseDurationMs('', 5000)).toBe(5000);
    });
  });

  describe('with numeric values (milliseconds)', () => {
    it('parses integer milliseconds', () => {
      expect(parseDurationMs('1000', 0)).toBe(1000);
      expect(parseDurationMs('60000', 0)).toBe(60000);
    });

    it('parses zero', () => {
      expect(parseDurationMs('0', 5000)).toBe(0);
    });

    it('parses large numbers', () => {
      expect(parseDurationMs('86400000', 0)).toBe(86400000); // 24 hours
    });
  });

  describe('with hour format', () => {
    it('parses whole hours', () => {
      expect(parseDurationMs('1h', 0)).toBe(3600000); // 1 hour in ms
      expect(parseDurationMs('4h', 0)).toBe(14400000); // 4 hours in ms
      expect(parseDurationMs('24h', 0)).toBe(86400000); // 24 hours in ms
    });

    it('parses fractional hours', () => {
      expect(parseDurationMs('0.5h', 0)).toBe(1800000); // 30 minutes in ms
      expect(parseDurationMs('1.5h', 0)).toBe(5400000); // 1.5 hours in ms
    });

    it('is case-insensitive', () => {
      expect(parseDurationMs('4H', 0)).toBe(14400000);
    });
  });

  describe('with minute format', () => {
    it('parses whole minutes', () => {
      expect(parseDurationMs('1m', 0)).toBe(60000); // 1 minute in ms
      expect(parseDurationMs('15m', 0)).toBe(900000); // 15 minutes in ms
      expect(parseDurationMs('30m', 0)).toBe(1800000); // 30 minutes in ms
    });

    it('parses fractional minutes', () => {
      expect(parseDurationMs('0.5m', 0)).toBe(30000); // 30 seconds in ms
      expect(parseDurationMs('1.5m', 0)).toBe(90000); // 1.5 minutes in ms
    });

    it('is case-insensitive', () => {
      expect(parseDurationMs('30M', 0)).toBe(1800000);
    });
  });

  describe('with second format', () => {
    it('parses whole seconds', () => {
      expect(parseDurationMs('1s', 0)).toBe(1000); // 1 second in ms
      expect(parseDurationMs('30s', 0)).toBe(30000); // 30 seconds in ms
      expect(parseDurationMs('60s', 0)).toBe(60000); // 60 seconds in ms
    });

    it('parses fractional seconds', () => {
      expect(parseDurationMs('0.5s', 0)).toBe(500); // 500ms
      expect(parseDurationMs('1.5s', 0)).toBe(1500); // 1.5 seconds in ms
    });

    it('is case-insensitive', () => {
      expect(parseDurationMs('60S', 0)).toBe(60000);
    });
  });

  describe('with invalid formats', () => {
    it('returns default for invalid unit', () => {
      expect(parseDurationMs('4d', 5000)).toBe(5000); // 'd' not supported
      expect(parseDurationMs('4w', 5000)).toBe(5000); // 'w' not supported
    });

    it('returns default for malformed strings', () => {
      expect(parseDurationMs('abc', 5000)).toBe(5000);
      expect(parseDurationMs('4hm', 5000)).toBe(5000);
      expect(parseDurationMs('h4', 5000)).toBe(5000);
      expect(parseDurationMs('4 h', 5000)).toBe(5000); // space not allowed
    });

    it('returns default for negative values in format', () => {
      // Regex doesn't match negative, so falls back to default
      expect(parseDurationMs('-4h', 5000)).toBe(5000);
    });
  });
});
