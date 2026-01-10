/**
 * Safe Logger Tests
 *
 * Tests for fallback logging and error serialization.
 *
 * @module utils/__tests__/safe-logger.test
 */

import { describe, it, expect } from 'vitest';
import { safeLog, getLogger, createLogger, serializeError } from '../safe-logger.js';

describe('Safe Logger', () => {
  describe('safeLog', () => {
    it('should return a logger with all methods', () => {
      const logger = safeLog();

      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should log messages without throwing', () => {
      const logger = safeLog();

      // These should not throw - either uses pino or console fallback
      expect(() => logger.debug('debug message')).not.toThrow();
      expect(() => logger.info('info message')).not.toThrow();
      expect(() => logger.warn('warn message')).not.toThrow();
      expect(() => logger.error('error message')).not.toThrow();
    });

    it('should handle bindings object', () => {
      const logger = safeLog();

      // Should not throw
      expect(() => {
        logger.info({ userId: '123', action: 'test' }, 'Message with bindings');
      }).not.toThrow();
    });
  });

  describe('getLogger', () => {
    it('should be alias for safeLog', () => {
      expect(getLogger).toBe(safeLog);
    });
  });

  describe('createLogger', () => {
    it('should create child logger with bindings', () => {
      const logger = createLogger({ module: 'TestModule' });

      expect(() => logger.info('Test message')).not.toThrow();
    });

    it('should support nested child loggers', () => {
      const logger = createLogger({ module: 'Parent' });
      const childLogger = logger.child({ submodule: 'Child' });

      expect(() => childLogger.info('Child message')).not.toThrow();
    });
  });

  describe('serializeError', () => {
    it('should serialize Error objects', () => {
      const error = new Error('Test error');
      error.name = 'TestError';

      const serialized = serializeError(error) as Record<string, unknown>;

      expect(serialized.name).toBe('TestError');
      expect(serialized.message).toBe('Test error');
      expect(serialized.stack).toBeDefined();
    });

    it('should include custom error properties', () => {
      const error = new Error('Test error') as Error & { code: string; statusCode: number };
      error.code = 'ERR_TEST';
      error.statusCode = 500;

      const serialized = serializeError(error) as Record<string, unknown>;

      expect(serialized.code).toBe('ERR_TEST');
      expect(serialized.statusCode).toBe(500);
    });

    it('should return non-Error values as-is', () => {
      expect(serializeError('string')).toBe('string');
      expect(serializeError(123)).toBe(123);
      expect(serializeError({ custom: 'object' })).toEqual({ custom: 'object' });
      expect(serializeError(null)).toBe(null);
    });

    it('should handle nested error causes', () => {
      const cause = new Error('Cause error');
      const error = new Error('Main error', { cause });

      const serialized = serializeError(error) as Record<string, unknown>;

      expect(serialized.message).toBe('Main error');
      // cause is not enumerable by default, so it's handled by the cause property if supported
    });
  });

  describe('error serialization in logs', () => {
    it('should handle error in bindings without throwing', () => {
      const logger = safeLog();
      const error = new Error('Something went wrong');

      // Should not throw when logging with error
      expect(() => logger.error({ error }, 'Operation failed')).not.toThrow();
    });

    it('should handle err in bindings without throwing (pino convention)', () => {
      const logger = safeLog();
      const err = new Error('Something went wrong');

      // Should not throw when logging with err
      expect(() => logger.error({ err }, 'Operation failed')).not.toThrow();
    });
  });
});
