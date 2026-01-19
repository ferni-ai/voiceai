/**
 * Safe Logger Tests
 *
 * Tests for the safe logging utility:
 * - Fallback logger creation with console methods
 * - safeLog fallback when LiveKit logger unavailable
 * - getLogger alias
 * - createLogger with bindings
 */

import { describe, it, expect, vi } from 'vitest';
import { safeLog, getLogger, createLogger, type FallbackLogger } from '../utils/safe-logger.js';

describe('Safe Logger', () => {
  describe('safeLog', () => {
    it('should return a logger with all required methods', () => {
      const logger = safeLog();

      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should not throw when called', () => {
      expect(() => safeLog()).not.toThrow();
    });

    it('should return logger that can be called without throwing', () => {
      const logger = safeLog();

      // These should not throw
      expect(() => logger.debug('debug message')).not.toThrow();
      expect(() => logger.info('info message')).not.toThrow();
      expect(() => logger.warn('warn message')).not.toThrow();
      expect(() => logger.error('error message')).not.toThrow();
    });

    it('should return logger that supports object bindings', () => {
      const logger = safeLog();

      // Should not throw when called with object bindings
      expect(() => logger.info({ key: 'value' }, 'message')).not.toThrow();
    });
  });

  describe('getLogger', () => {
    it('should return a logger with all required methods', () => {
      const logger = getLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should not throw when called', () => {
      expect(() => getLogger()).not.toThrow();
    });
  });

  describe('createLogger', () => {
    it('should return a logger with bindings', () => {
      const logger = createLogger({ module: 'test', userId: '123' });

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should support child loggers', () => {
      const logger = createLogger({ module: 'Parent' });
      const childLogger = logger.child({ submodule: 'Child' });

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should not throw when logging with bindings', () => {
      const logger = createLogger({ module: 'TestModule' });

      expect(() => logger.info('test message')).not.toThrow();
      expect(() => logger.info({ extra: 'data' }, 'test with bindings')).not.toThrow();
    });
  });

  describe('Fallback Logger Child', () => {
    it('should create child loggers that work', () => {
      const parentLogger = createLogger({ module: 'Parent' });
      const childLogger = parentLogger.child({ action: 'test' });

      expect(childLogger).toBeDefined();
      expect(() => childLogger.info('message')).not.toThrow();
    });

    it('should support multiple levels of child loggers', () => {
      const parentLogger = createLogger({ module: 'Parent' });
      const childLogger = parentLogger.child({ level1: 'first' });
      const grandchildLogger = childLogger.child({ level2: 'second' });

      expect(grandchildLogger).toBeDefined();
      expect(() => grandchildLogger.info('nested message')).not.toThrow();
    });
  });

  describe('Error Serialization', () => {
    it('should handle Error objects in bindings without throwing', () => {
      const logger = createLogger({ module: 'test' });
      const testError = new Error('Test error');

      expect(() => logger.error({ error: testError }, 'Something went wrong')).not.toThrow();
    });

    it('should handle err key (pino convention) without throwing', () => {
      const logger = createLogger({ module: 'test' });
      const testError = new Error('Test error');

      expect(() => logger.error({ err: testError }, 'Something went wrong')).not.toThrow();
    });
  });
});
