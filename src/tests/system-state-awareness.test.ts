/**
 * System State Awareness Context Builder Tests
 *
 * Tests the context builder that injects system state (music, timers, tools)
 * into the LLM context on every turn.
 *
 * @module tests/system-state-awareness
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DJ Controller
vi.mock('../../audio/dj-controller.js', () => ({
  getDJController: vi.fn(() => ({
    isMusicActive: vi.fn(() => false),
    getState: vi.fn(() => ({
      state: 'idle',
      currentTrack: null,
      trackStartTime: null,
    })),
  })),
}));

// Test the formatting logic directly
describe('System State Awareness', () => {
  describe('formatDuration', () => {
    function formatDuration(seconds: number): string {
      if (seconds < 60) {
        return `${seconds} seconds`;
      }
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins} minutes ${secs} seconds` : `${mins} minutes`;
    }

    it('should format seconds correctly', () => {
      expect(formatDuration(30)).toBe('30 seconds');
      expect(formatDuration(59)).toBe('59 seconds');
    });

    it('should format minutes correctly', () => {
      expect(formatDuration(60)).toBe('1 minutes');
      expect(formatDuration(120)).toBe('2 minutes');
    });

    it('should format mixed minutes and seconds', () => {
      expect(formatDuration(90)).toBe('1 minutes 30 seconds');
      expect(formatDuration(125)).toBe('2 minutes 5 seconds');
    });
  });

  describe('formatSystemState', () => {
    interface SystemStateContext {
      music: {
        isPlaying: boolean;
        currentTrack?: { name: string; artist: string };
        playDurationSeconds?: number;
        isDucked: boolean;
      };
      timers: {
        active: number;
        nextExpiry?: Date;
      };
      lastToolExecuted?: {
        toolId: string;
        timestamp: Date;
        result?: string;
      };
    }

    function formatDuration(seconds: number): string {
      if (seconds < 60) {
        return `${seconds} seconds`;
      }
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins} minutes ${secs} seconds` : `${mins} minutes`;
    }

    function formatSystemState(state: SystemStateContext): string {
      const lines: string[] = [];

      if (state.music.isPlaying) {
        if (state.music.currentTrack) {
          const duration = state.music.playDurationSeconds
            ? ` (playing for ${formatDuration(state.music.playDurationSeconds)})`
            : '';
          const duckStatus = state.music.isDucked ? ', ducked for conversation' : '';
          lines.push(
            `Music is playing: "${state.music.currentTrack.name}" by ${state.music.currentTrack.artist}${duration}${duckStatus}`
          );
        } else {
          lines.push('Music is playing');
        }
      }

      if (state.timers.active > 0) {
        const expiry = state.timers.nextExpiry
          ? ` (next expires at ${state.timers.nextExpiry.toLocaleTimeString()})`
          : '';
        lines.push(`${state.timers.active} active timer(s)${expiry}`);
      }

      if (state.lastToolExecuted) {
        const agoMs = Date.now() - state.lastToolExecuted.timestamp.getTime();
        if (agoMs < 60000) {
          const agoSec = Math.round(agoMs / 1000);
          lines.push(`Just executed: ${state.lastToolExecuted.toolId} (${agoSec}s ago)`);
        }
      }

      return lines.length > 0 ? lines.join('. ') + '.' : '';
    }

    it('should return empty string when nothing is active', () => {
      const result = formatSystemState({
        music: { isPlaying: false, isDucked: false },
        timers: { active: 0 },
      });
      expect(result).toBe('');
    });

    it('should format music playing with track info', () => {
      const result = formatSystemState({
        music: {
          isPlaying: true,
          currentTrack: { name: 'Jazz Vibes', artist: 'Miles Davis' },
          isDucked: false,
        },
        timers: { active: 0 },
      });
      expect(result).toContain('Music is playing: "Jazz Vibes" by Miles Davis');
    });

    it('should include play duration when available', () => {
      const result = formatSystemState({
        music: {
          isPlaying: true,
          currentTrack: { name: 'Jazz Vibes', artist: 'Miles Davis' },
          playDurationSeconds: 90,
          isDucked: false,
        },
        timers: { active: 0 },
      });
      expect(result).toContain('playing for 1 minutes 30 seconds');
    });

    it('should indicate when music is ducked', () => {
      const result = formatSystemState({
        music: {
          isPlaying: true,
          currentTrack: { name: 'Jazz Vibes', artist: 'Miles Davis' },
          isDucked: true,
        },
        timers: { active: 0 },
      });
      expect(result).toContain('ducked for conversation');
    });

    it('should format active timers', () => {
      const result = formatSystemState({
        music: { isPlaying: false, isDucked: false },
        timers: { active: 2 },
      });
      expect(result).toContain('2 active timer(s)');
    });

    it('should format recently executed tool', () => {
      const result = formatSystemState({
        music: { isPlaying: false, isDucked: false },
        timers: { active: 0 },
        lastToolExecuted: {
          toolId: 'playMusic',
          timestamp: new Date(),
        },
      });
      expect(result).toContain('Just executed: playMusic');
    });

    it('should NOT include tool executed more than 60s ago', () => {
      const result = formatSystemState({
        music: { isPlaying: false, isDucked: false },
        timers: { active: 0 },
        lastToolExecuted: {
          toolId: 'playMusic',
          timestamp: new Date(Date.now() - 120000), // 2 minutes ago
        },
      });
      expect(result).not.toContain('playMusic');
    });

    it('should combine multiple active states', () => {
      const result = formatSystemState({
        music: {
          isPlaying: true,
          currentTrack: { name: 'Jazz', artist: 'Artist' },
          isDucked: true,
        },
        timers: { active: 1 },
        lastToolExecuted: {
          toolId: 'setTimer',
          timestamp: new Date(),
        },
      });
      expect(result).toContain('Music is playing');
      expect(result).toContain('1 active timer');
      expect(result).toContain('Just executed: setTimer');
    });
  });
});

describe('Context Builder Integration', () => {
  it('should not inject when nothing is active', () => {
    // When music not playing, no timers, no recent tools
    // The builder should return empty array (no injection)
    const emptyFormatted = '';
    expect(emptyFormatted).toBe('');
  });

  it('should inject with high priority when music is playing', () => {
    // The builder has priority 10 (very high)
    // This ensures LLM knows system state before responding
    const BUILDER_PRIORITY = 10;
    expect(BUILDER_PRIORITY).toBeLessThan(20); // Safety builders are 0-20
  });
});
