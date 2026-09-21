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

import {
  formatDuration,
  formatSystemState,
  systemStateAwarenessBuilder,
} from '../intelligence/context-builders/awareness/system-state-awareness.js';

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

  describe('formatSystemState', () => {
    it('should return empty string when nothing is active', () => {
      expect(formatSystemState({ ...idle })).toBe('');
    });

    it('should format music playing with track info', () => {
      const result = formatSystemState({
        ...idle,
        music: {
          isPlaying: true,
          isDucked: false,
          currentTrack: { name: 'Blue in Green', artist: 'Miles Davis' },
        },
      });

      expect(result).toContain('Blue in Green');
      expect(result).toContain('Miles Davis');
      expect(result).toContain('Music is playing');
    });

    it('should include play duration when available', () => {
      const result = formatSystemState({
        ...idle,
        music: {
          isPlaying: true,
          isDucked: false,
          currentTrack: { name: 'Blue in Green', artist: 'Miles Davis' },
          playDurationSeconds: 90,
        },
      });

      expect(result).toContain('playing for 1 minutes 30 seconds');
    });

    it('should indicate when music is ducked', () => {
      const result = formatSystemState({
        ...idle,
        music: {
          isPlaying: true,
          isDucked: true,
          currentTrack: { name: 'Blue in Green', artist: 'Miles Davis' },
        },
      });

      expect(result).toContain('ducked for conversation');
    });

    it('should tell the LLM not to offer music that is already playing', () => {
      const result = formatSystemState({
        ...idle,
        music: { isPlaying: true, isDucked: false },
      });

      // The guidance block is the point of this builder
      expect(result).toContain('[GUIDANCE:');
      expect(result.toLowerCase()).toContain('already on');
    });

    it('should format active timers', () => {
      const result = formatSystemState({ ...idle, timers: { active: 2 } });

      expect(result).toContain('2 active timer(s)');
      expect(result).toContain('[GUIDANCE:');
    });

    it('should format a recently executed tool', () => {
      const result = formatSystemState({
        ...idle,
        lastToolExecuted: { toolId: 'playMusic', timestamp: new Date() },
      });

      expect(result).toContain('Just executed: playMusic');
    });

    it('should NOT include a tool executed more than 30s ago', () => {
      // Production's window is 30s, not the 60s the old local copy used.
      const result = formatSystemState({
        ...idle,
        lastToolExecuted: {
          toolId: 'playMusic',
          timestamp: new Date(Date.now() - 31_000),
        },
      });

      expect(result).not.toContain('Just executed');
      expect(result).toBe('');
    });

    it('should still include a tool executed 29s ago', () => {
      const result = formatSystemState({
        ...idle,
        lastToolExecuted: {
          toolId: 'playMusic',
          timestamp: new Date(Date.now() - 29_000),
        },
      });

      expect(result).toContain('Just executed: playMusic');
    });

    it('should combine multiple active states', () => {
      const result = formatSystemState({
        music: {
          isPlaying: true,
          isDucked: false,
          currentTrack: { name: 'Blue in Green', artist: 'Miles Davis' },
        },
        timers: { active: 1 },
        lastToolExecuted: { toolId: 'setTimer', timestamp: new Date() },
      });

      expect(result).toContain('Music is playing');
      expect(result).toContain('1 active timer(s)');
      expect(result).toContain('Just executed: setTimer');
    });
  });
});

describe('Context Builder Integration', () => {
  it('should be registered with a name and description', () => {
    expect(systemStateAwarenessBuilder.name).toBe('system-state-awareness');
    expect(systemStateAwarenessBuilder.description).toBeTruthy();
    expect(typeof systemStateAwarenessBuilder.build).toBe('function');
  });

  it('should run at a priority ahead of ordinary context builders', () => {
    // The LLM must know system state before responding
    expect(systemStateAwarenessBuilder.priority).toBe(10);
    expect(systemStateAwarenessBuilder.priority).toBeLessThan(20);
  });
});
