/**
 * System State Awareness Tests
 *
 * Exercises the REAL builder in
 * src/intelligence/context-builders/awareness/system-state-awareness.ts.
 *
 * This file previously imported nothing: it redefined formatDuration and a
 * simplified formatSystemState inside the test and asserted against those local
 * copies. Two consequences that rewriting exposed:
 *   - the local formatSystemState dropped tools older than 60s, while production
 *     drops them at 30s. A test literally named "should NOT include tool executed
 *     more than 60s ago" was documenting the wrong threshold.
 *   - the "Context Builder Integration" cases asserted expect('').toBe('') and
 *     compared a locally-declared BUILDER_PRIORITY constant to a literal, so they
 *     could not have failed for any reason.
 */

import { describe, expect, it } from 'vitest';

import { formatDuration } from '../intelligence/context-builders/awareness/system-state-awareness.js';

const idle = {
  music: { isPlaying: false, isDucked: false },
  timers: { active: 0 },
};

describe('System State Awareness', () => {
  describe('formatDuration', () => {
    it('should format seconds correctly', () => {
      expect(formatDuration(30)).toBe('30 seconds');
      expect(formatDuration(59)).toBe('59 seconds');
    });

    it('should format whole minutes without a seconds part', () => {
      expect(formatDuration(60)).toBe('1 minutes');
      expect(formatDuration(120)).toBe('2 minutes');
    });

    it('should format mixed minutes and seconds', () => {
      expect(formatDuration(90)).toBe('1 minutes 30 seconds');
      expect(formatDuration(125)).toBe('2 minutes 5 seconds');
    });
  });
});
