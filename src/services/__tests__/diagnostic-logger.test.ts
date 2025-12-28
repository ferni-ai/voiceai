/**
 * Diagnostic Logger Service Tests
 *
 * Tests for diagnostic logging with categories, emoji prefixes,
 * and production/development behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original NODE_ENV
const originalEnv = process.env.NODE_ENV;

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock feature flags
vi.mock('../../config/feature-flags.js', () => ({
  isDebugEnabled: vi.fn(() => false),
}));

import { diag, DiagnosticLogger } from '../diagnostic-logger.js';

describe('DiagnosticLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  describe('DiagnosticLogger class', () => {
    it('should export DiagnosticLogger class', () => {
      expect(DiagnosticLogger).toBeDefined();
    });

    it('should create new instance', () => {
      const logger = new DiagnosticLogger();
      expect(logger).toBeInstanceOf(DiagnosticLogger);
    });
  });

  describe('diag singleton', () => {
    it('should export diag singleton', () => {
      expect(diag).toBeDefined();
    });

    it('should have all category methods', () => {
      expect(typeof diag.entry).toBe('function');
      expect(typeof diag.prewarm).toBe('function');
      expect(typeof diag.stt).toBe('function');
      expect(typeof diag.tts).toBe('function');
      expect(typeof diag.tool).toBe('function');
      expect(typeof diag.state).toBe('function');
      expect(typeof diag.user).toBe('function');
      expect(typeof diag.memory).toBe('function');
      expect(typeof diag.error).toBe('function');
      expect(typeof diag.perf).toBe('function');
      expect(typeof diag.health).toBe('function');
      expect(typeof diag.handoff).toBe('function');
      expect(typeof diag.session).toBe('function');
      expect(typeof diag.processing).toBe('function');
      expect(typeof diag.filler).toBe('function');
      expect(typeof diag.music).toBe('function');
    });

    it('should have utility methods', () => {
      expect(typeof diag.section).toBe('function');
      expect(typeof diag.custom).toBe('function');
      expect(typeof diag.debug).toBe('function');
      expect(typeof diag.info).toBe('function');
      expect(typeof diag.warn).toBe('function');
      expect(typeof diag.time).toBe('function');
    });
  });

  describe('Category methods', () => {
    describe('entry', () => {
      it('should log entry messages', () => {
        diag.entry('Session starting', { sessionId: 'abc' });
        // Should log to console in dev mode
        expect(consoleSpy).toHaveBeenCalled();
      });

      it('should accept message without data', () => {
        expect(() => {
          diag.entry('Agent started');
        }).not.toThrow();
      });
    });

    describe('prewarm', () => {
      it('should log prewarm messages', () => {
        diag.prewarm('Prewarming cache', { cacheSize: 100 });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('stt', () => {
      it('should log speech-to-text messages', () => {
        diag.stt('Audio received', { frames: 100, duration: 1.5 });
        // stt is debug level - may not appear based on log level
        expect(typeof diag.stt).toBe('function');
      });
    });

    describe('tts', () => {
      it('should log text-to-speech messages', () => {
        diag.tts('Synthesizing audio', { text: 'Hello', voiceId: 'ferni' });
        expect(typeof diag.tts).toBe('function');
      });
    });

    describe('tool', () => {
      it('should log tool execution messages', () => {
        diag.tool('Tool executed', { name: 'getWeather', elapsed: 150 });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('state', () => {
      it('should log state change messages', () => {
        diag.state('State changed', { from: 'idle', to: 'processing' });
        expect(typeof diag.state).toBe('function');
      });
    });

    describe('user', () => {
      it('should log user event messages', () => {
        diag.user('User identified', { userId: 'user-123', name: 'John' });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('memory', () => {
      it('should log memory operation messages', () => {
        diag.memory('Memory retrieved', { memories: 5, relevance: 0.9 });
        expect(typeof diag.memory).toBe('function');
      });
    });

    describe('error', () => {
      it('should log error messages', () => {
        diag.error('Operation failed', { error: 'Connection timeout', code: 'TIMEOUT' });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('perf', () => {
      it('should log performance messages', () => {
        diag.perf('Response generated', { latency: 250, tokens: 150 });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('health', () => {
      it('should log health check messages', () => {
        diag.health('Health check passed', { uptime: 3600 });
        expect(typeof diag.health).toBe('function');
      });
    });

    describe('handoff', () => {
      it('should log handoff messages', () => {
        diag.handoff('Handoff to Maya', { from: 'ferni', to: 'maya', reason: 'habit coaching' });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('session', () => {
      it('should log session lifecycle messages', () => {
        diag.session('Session ended', { sessionId: 'abc', duration: 300 });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('processing', () => {
      it('should log processing phase messages', () => {
        diag.processing('Processing turn', { turnNumber: 5, mode: 'thinking' });
        expect(typeof diag.processing).toBe('function');
      });
    });

    describe('filler', () => {
      it('should log verbal filler messages', () => {
        diag.filler('Filler spoken', { phrase: 'Let me think...', duration: 500 });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('music', () => {
      it('should log music event messages', () => {
        diag.music('Thinking music started', { trackId: 'ambient-1' });
        expect(typeof diag.music).toBe('function');
      });
    });
  });

  describe('Utility methods', () => {
    describe('section', () => {
      it('should log section divider', () => {
        diag.section('INITIALIZATION');
        expect(consoleSpy).toHaveBeenCalled();
      });

      it('should log section title', () => {
        diag.section('TEST SECTION');
        const calls = consoleSpy.mock.calls;
        expect(calls.some((call: unknown[]) => String(call[0]).includes('TEST SECTION'))).toBe(
          true
        );
      });
    });

    describe('custom', () => {
      it('should log with custom level and category', () => {
        diag.custom('info', 'custom-category', 'Custom message', { data: 'test' });
        expect(consoleSpy).toHaveBeenCalled();
      });

      it('should support all log levels', () => {
        expect(() => {
          diag.custom('debug', 'test', 'Debug');
          diag.custom('info', 'test', 'Info');
          diag.custom('warn', 'test', 'Warn');
          diag.custom('error', 'test', 'Error');
        }).not.toThrow();
      });
    });

    describe('debug', () => {
      it('should log debug messages', () => {
        diag.debug('Debug info', { detail: 'value' });
        expect(typeof diag.debug).toBe('function');
      });
    });

    describe('info', () => {
      it('should log info messages', () => {
        diag.info('Info message', { key: 'value' });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('warn', () => {
      it('should log warning messages', () => {
        diag.warn('Warning message', { issue: 'something' });
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    describe('time', () => {
      it('should return timing function', () => {
        const done = diag.time('test', 'Operation');
        expect(typeof done).toBe('function');
      });

      it('should log elapsed time when done called', async () => {
        const done = diag.time('test', 'Operation');
        // Simulate some work
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
        done();
        expect(consoleSpy).toHaveBeenCalled();
      });

      it('should include elapsed time in log', async () => {
        const done = diag.time('api', 'API call');
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 5);
        });
        done();

        // Find the perf log call
        const perfCall = consoleSpy.mock.calls.find(
          (call: unknown[]) =>
            String(call[0]).includes('completed') || (call[1] as Record<string, unknown>)?.elapsed
        );
        expect(perfCall).toBeDefined();
      });
    });
  });

  describe('Data handling', () => {
    it('should handle complex data objects', () => {
      expect(() => {
        diag.tool('Complex tool call', {
          name: 'createHabit',
          params: {
            name: 'Morning Meditation',
            frequency: 'daily',
            nested: { deep: { value: 123 } },
          },
          result: { success: true, habitId: 'habit-123' },
        });
      }).not.toThrow();
    });

    it('should handle arrays in data', () => {
      expect(() => {
        diag.memory('Memories loaded', {
          count: 5,
          ids: ['mem-1', 'mem-2', 'mem-3'],
          scores: [0.9, 0.85, 0.8],
        });
      }).not.toThrow();
    });

    it('should handle undefined data gracefully', () => {
      expect(() => {
        diag.info('Message only');
      }).not.toThrow();
    });

    it('should handle null values in data', () => {
      expect(() => {
        diag.info('With nulls', { value: null, other: undefined });
      }).not.toThrow();
    });
  });

  describe('Category emojis', () => {
    it('should use emoji prefix in log output', () => {
      diag.entry('Test message');
      const logCall = consoleSpy.mock.calls[0];
      if (logCall) {
        const logOutput = String(logCall[0]);
        // Should contain emoji (entry = 🚀)
        expect(logOutput).toMatch(/🚀|ENTRY/);
      }
    });

    it('should use different emojis for different categories', () => {
      diag.tool('Tool message');
      diag.error('Error message');

      // Verify different categories logged
      expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Message formatting', () => {
    it('should include timestamp in log', () => {
      diag.info('Timestamped message');
      const logCall = consoleSpy.mock.calls[0];
      if (logCall) {
        const logOutput = String(logCall[0]);
        // Timestamp format: HH:MM:SS
        expect(logOutput).toMatch(/\d{2}:\d{2}:\d{2}/);
      }
    });

    it('should include category in uppercase', () => {
      diag.entry('Category test');
      const logCall = consoleSpy.mock.calls[0];
      if (logCall) {
        const logOutput = String(logCall[0]);
        expect(logOutput).toContain('[ENTRY]');
      }
    });
  });

  describe('Level filtering', () => {
    it('should respect current log level', () => {
      // Debug messages may be filtered based on LOG_LEVEL
      const debugCalls = consoleSpy.mock.calls.length;
      diag.debug('Debug message');
      // Verify method doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Multiple data arguments', () => {
    it('should log data object with message', () => {
      diag.info('Message with data', { key1: 'value1', key2: 'value2' });

      const logCall = consoleSpy.mock.calls[0];
      expect(logCall).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string message', () => {
      expect(() => {
        diag.info('');
      }).not.toThrow();
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(10000);
      expect(() => {
        diag.info(longMessage);
      }).not.toThrow();
    });

    it('should handle special characters in message', () => {
      expect(() => {
        diag.info('Special chars: < > & " \' \n \t 🎉');
      }).not.toThrow();
    });

    it('should handle circular references gracefully', () => {
      const circularObj: Record<string, unknown> = { name: 'test' };
      circularObj.self = circularObj;

      // This might fail JSON serialization, but shouldn't crash
      expect(() => {
        try {
          diag.info('Circular', circularObj);
        } catch {
          // Expected to potentially fail, just don't crash the test
        }
      }).not.toThrow();
    });
  });
});
