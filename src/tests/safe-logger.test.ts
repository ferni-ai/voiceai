/**
 * Safe Logger Tests
 *
 * Tests for the safe logging utility:
 * - Fallback logger creation with console methods
 * - safeLog fallback when LiveKit logger unavailable
 * - getLogger alias
 * - createLogger with bindings
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @livekit/agents log function
vi.mock('@livekit/agents', () => ({
  log: vi.fn(),
}));

import { safeLog, getLogger, createLogger, type FallbackLogger } from '../utils/safe-logger.js';
import { log } from '@livekit/agents';

describe('Safe Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('safeLog', () => {
    it('should return LiveKit logger when available', () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      };
      vi.mocked(log).mockReturnValue(mockLogger as unknown as ReturnType<typeof log>);

      const logger = safeLog();

      expect(logger).toBe(mockLogger);
    });

    it('should return fallback logger when LiveKit throws', () => {
      vi.mocked(log).mockImplementation(() => {
        throw new Error('Logger not initialized');
      });

      const logger = safeLog();

      // Should not throw and return a fallback logger
      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should fallback logger have working console methods', () => {
      vi.mocked(log).mockImplementation(() => {
        throw new Error('Logger not initialized');
      });

      const consoleSpy = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };

      const logger = safeLog() as FallbackLogger;

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).toHaveBeenCalled();
      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();

      // Cleanup
      Object.values(consoleSpy).forEach((spy) => spy.mockRestore());
    });
  });

  describe('getLogger', () => {
    it('should be an alias for safeLog', () => {
      expect(getLogger).toBe(safeLog);
    });

    it('should return a logger instance', () => {
      vi.mocked(log).mockImplementation(() => {
        throw new Error('Not initialized');
      });

      const logger = getLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });
  });

  describe('createLogger', () => {
    it('should create logger with bindings when LiveKit available', () => {
      const mockChildLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      };
      const mockLogger = {
        child: vi.fn(() => mockChildLogger),
      };
      vi.mocked(log).mockReturnValue(mockLogger as unknown as ReturnType<typeof log>);

      const logger = createLogger({ module: 'test', userId: '123' });

      expect(mockLogger.child).toHaveBeenCalledWith({ module: 'test', userId: '123' });
    });

    it('should create fallback logger with bindings when LiveKit unavailable', () => {
      vi.mocked(log).mockImplementation(() => {
        throw new Error('Not initialized');
      });

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const logger = createLogger({ module: 'TestModule' });
      logger.info('test message');

      // Should include binding prefix
      expect(infoSpy).toHaveBeenCalled();
      const callArgs = infoSpy.mock.calls[0];
      expect(callArgs[0]).toContain('TestModule');

      infoSpy.mockRestore();
    });

    it('should support child loggers on fallback', () => {
      vi.mocked(log).mockImplementation(() => {
        throw new Error('Not initialized');
      });

      const logger = createLogger({ module: 'Parent' });
      const childLogger = logger.child({ submodule: 'Child' });

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });
  });

  describe('Fallback Logger Child', () => {
    it('should merge bindings when creating child logger', () => {
      vi.mocked(log).mockImplementation(() => {
        throw new Error('Not initialized');
      });

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const parentLogger = createLogger({ module: 'Parent' });
      const childLogger = parentLogger.child({ action: 'test' });
      childLogger.info('message');

      // Child logger should include both parent and child bindings
      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });
  });
});
