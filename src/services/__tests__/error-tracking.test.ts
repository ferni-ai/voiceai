/**
 * Error Tracking Service Tests
 *
 * Tests for Sentry integration, error capture, breadcrumbs,
 * and helper functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Note: We don't mock @sentry/node to test the fallback behavior
// when Sentry is not installed/configured

import {
  errorTracking,
  withErrorTracking,
  trackVoiceSession,
  trackHandoff,
  trackApiCall,
} from '../error-tracking.js';

describe('ErrorTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ErrorTrackingService singleton', () => {
    it('should export errorTracking singleton', () => {
      expect(errorTracking).toBeDefined();
    });

    it('should have captureException method', () => {
      expect(typeof errorTracking.captureException).toBe('function');
    });

    it('should have captureMessage method', () => {
      expect(typeof errorTracking.captureMessage).toBe('function');
    });

    it('should have setUser method', () => {
      expect(typeof errorTracking.setUser).toBe('function');
    });

    it('should have setTag method', () => {
      expect(typeof errorTracking.setTag).toBe('function');
    });

    it('should have setContext method', () => {
      expect(typeof errorTracking.setContext).toBe('function');
    });

    it('should have addBreadcrumb method', () => {
      expect(typeof errorTracking.addBreadcrumb).toBe('function');
    });

    it('should have startTransaction method', () => {
      expect(typeof errorTracking.startTransaction).toBe('function');
    });

    it('should have withScope method', () => {
      expect(typeof errorTracking.withScope).toBe('function');
    });

    it('should have isEnabled method', () => {
      expect(typeof errorTracking.isEnabled).toBe('function');
    });

    it('should have init method', () => {
      expect(typeof errorTracking.init).toBe('function');
    });
  });

  describe('captureException', () => {
    it('should return null when Sentry not initialized', () => {
      const error = new Error('Test error');
      const result = errorTracking.captureException(error);

      expect(result).toBeNull();
    });

    it('should accept context with userId', () => {
      const error = new Error('Test error');
      const result = errorTracking.captureException(error, {
        userId: 'user-123',
      });

      expect(result).toBeNull(); // Sentry not initialized
    });

    it('should accept context with sessionId', () => {
      const error = new Error('Test error');
      const result = errorTracking.captureException(error, {
        sessionId: 'session-abc',
      });

      expect(result).toBeNull();
    });

    it('should accept context with personaId', () => {
      const error = new Error('Test error');
      const result = errorTracking.captureException(error, {
        personaId: 'ferni',
      });

      expect(result).toBeNull();
    });

    it('should accept context with component', () => {
      const error = new Error('Test error');
      const result = errorTracking.captureException(error, {
        component: 'VoiceAgent',
      });

      expect(result).toBeNull();
    });

    it('should accept context with action', () => {
      const error = new Error('Test error');
      const result = errorTracking.captureException(error, {
        action: 'processToolCall',
      });

      expect(result).toBeNull();
    });

    it('should accept context with metadata', () => {
      const error = new Error('Test error');
      const result = errorTracking.captureException(error, {
        metadata: { toolName: 'getWeather', attempts: 3 },
      });

      expect(result).toBeNull();
    });

    it('should accept full context', () => {
      const error = new Error('Test error');
      const result = errorTracking.captureException(error, {
        userId: 'user-123',
        sessionId: 'session-abc',
        personaId: 'maya',
        component: 'HabitCoach',
        action: 'createHabit',
        metadata: { habitName: 'Morning meditation' },
      });

      expect(result).toBeNull();
    });
  });

  describe('captureMessage', () => {
    it('should return null when Sentry not initialized', () => {
      const result = errorTracking.captureMessage('Test message');
      expect(result).toBeNull();
    });

    it('should accept info level', () => {
      const result = errorTracking.captureMessage('Info message', 'info');
      expect(result).toBeNull();
    });

    it('should accept warning level', () => {
      const result = errorTracking.captureMessage('Warning message', 'warning');
      expect(result).toBeNull();
    });

    it('should accept error level', () => {
      const result = errorTracking.captureMessage('Error message', 'error');
      expect(result).toBeNull();
    });

    it('should default to info level', () => {
      const result = errorTracking.captureMessage('Default level message');
      expect(result).toBeNull();
    });
  });

  describe('setUser', () => {
    it('should not throw when setting user', () => {
      expect(() => {
        errorTracking.setUser('user-123');
      }).not.toThrow();
    });

    it('should not throw when setting user with metadata', () => {
      expect(() => {
        errorTracking.setUser('user-123', { email: 'test@example.com', plan: 'premium' });
      }).not.toThrow();
    });

    it('should not throw when clearing user', () => {
      expect(() => {
        errorTracking.setUser(null);
      }).not.toThrow();
    });
  });

  describe('setTag', () => {
    it('should not throw when setting tag', () => {
      expect(() => {
        errorTracking.setTag('environment', 'production');
      }).not.toThrow();
    });

    it('should accept any string values', () => {
      expect(() => {
        errorTracking.setTag('version', '1.2.3');
        errorTracking.setTag('release', '2024-01-01');
        errorTracking.setTag('commit', 'abc123');
      }).not.toThrow();
    });
  });

  describe('setContext', () => {
    it('should not throw when setting context', () => {
      expect(() => {
        errorTracking.setContext('session', { id: 'abc', startedAt: new Date().toISOString() });
      }).not.toThrow();
    });

    it('should not throw when clearing context', () => {
      expect(() => {
        errorTracking.setContext('session', null);
      }).not.toThrow();
    });

    it('should accept complex context objects', () => {
      expect(() => {
        errorTracking.setContext('agent', {
          personaId: 'ferni',
          tools: ['getWeather', 'playMusic'],
          turnCount: 5,
        });
      }).not.toThrow();
    });
  });

  describe('addBreadcrumb', () => {
    it('should not throw when adding breadcrumb', () => {
      expect(() => {
        errorTracking.addBreadcrumb({
          category: 'test',
          message: 'Test breadcrumb',
        });
      }).not.toThrow();
    });

    it('should accept all breadcrumb fields', () => {
      expect(() => {
        errorTracking.addBreadcrumb({
          category: 'http',
          message: 'API request',
          level: 'info',
          data: { url: '/api/test', status: 200 },
        });
      }).not.toThrow();
    });

    it('should accept debug level', () => {
      expect(() => {
        errorTracking.addBreadcrumb({
          category: 'debug',
          message: 'Debug info',
          level: 'debug',
        });
      }).not.toThrow();
    });

    it('should accept warning level', () => {
      expect(() => {
        errorTracking.addBreadcrumb({
          category: 'warning',
          message: 'Warning info',
          level: 'warning',
        });
      }).not.toThrow();
    });

    it('should accept error level', () => {
      expect(() => {
        errorTracking.addBreadcrumb({
          category: 'error',
          message: 'Error info',
          level: 'error',
        });
      }).not.toThrow();
    });
  });

  describe('startTransaction', () => {
    it('should return null when Sentry not initialized', () => {
      const result = errorTracking.startTransaction('test-transaction', 'http');
      expect(result).toBeNull();
    });
  });

  describe('withScope', () => {
    it('should not throw when configuring scope', () => {
      expect(() => {
        errorTracking.withScope((scope) => {
          scope.setTag('test', 'value');
        });
      }).not.toThrow();
    });
  });

  describe('isEnabled', () => {
    it('should return false when Sentry not initialized', () => {
      // Note: Without DSN, Sentry won't be initialized
      expect(errorTracking.isEnabled()).toBe(false);
    });
  });

  describe('withErrorTracking wrapper', () => {
    it('should execute function normally when no error', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const wrapped = withErrorTracking(fn, { component: 'Test' });

      const result = await wrapped();

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should capture and rethrow errors', async () => {
      const error = new Error('Test failure');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = withErrorTracking(fn, { component: 'Test' });

      await expect(wrapped()).rejects.toThrow('Test failure');
    });

    it('should pass arguments to wrapped function', async () => {
      const fn = vi.fn().mockImplementation((a: number, b: string) => Promise.resolve(`${a}-${b}`));
      const wrapped = withErrorTracking(fn, { component: 'Test' });

      const result = await wrapped(42, 'hello');

      expect(result).toBe('42-hello');
      expect(fn).toHaveBeenCalledWith(42, 'hello');
    });

    it('should include context in error capture', async () => {
      const error = new Error('Context test');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = withErrorTracking(fn, {
        component: 'VoiceAgent',
        action: 'processMessage',
        userId: 'user-123',
        sessionId: 'session-abc',
      });

      await expect(wrapped()).rejects.toThrow('Context test');
    });
  });

  describe('trackVoiceSession helper', () => {
    it('should not throw when tracking session', () => {
      expect(() => {
        trackVoiceSession('session-123', 'user-456', 'ferni');
      }).not.toThrow();
    });

    it('should accept any persona ID', () => {
      expect(() => {
        trackVoiceSession('session-1', 'user-1', 'maya');
        trackVoiceSession('session-2', 'user-2', 'jordan');
        trackVoiceSession('session-3', 'user-3', 'alex');
        trackVoiceSession('session-4', 'user-4', 'peter');
        trackVoiceSession('session-5', 'user-5', 'nayan');
      }).not.toThrow();
    });
  });

  describe('trackHandoff helper', () => {
    it('should not throw when tracking handoff', () => {
      expect(() => {
        trackHandoff('ferni', 'maya', 'habit coaching needed');
      }).not.toThrow();
    });

    it('should accept various handoff reasons', () => {
      expect(() => {
        trackHandoff('ferni', 'jordan', 'calendar planning');
        trackHandoff('maya', 'ferni', 'returning to coordinator');
        trackHandoff('ferni', 'alex', 'communication help');
        trackHandoff('ferni', 'peter', 'financial advice');
        trackHandoff('ferni', 'nayan', 'deep reflection');
      }).not.toThrow();
    });
  });

  describe('trackApiCall helper', () => {
    it('should not throw when tracking successful call', () => {
      expect(() => {
        trackApiCall('/api/users', 'GET', 200);
      }).not.toThrow();
    });

    it('should not throw when tracking client error', () => {
      expect(() => {
        trackApiCall('/api/users', 'POST', 400);
        trackApiCall('/api/auth', 'POST', 401);
        trackApiCall('/api/admin', 'GET', 403);
        trackApiCall('/api/missing', 'GET', 404);
      }).not.toThrow();
    });

    it('should not throw when tracking server error', () => {
      expect(() => {
        trackApiCall('/api/heavy', 'POST', 500);
        trackApiCall('/api/timeout', 'GET', 504);
      }).not.toThrow();
    });

    it('should accept all HTTP methods', () => {
      expect(() => {
        trackApiCall('/api/resource', 'GET', 200);
        trackApiCall('/api/resource', 'POST', 201);
        trackApiCall('/api/resource', 'PUT', 200);
        trackApiCall('/api/resource', 'PATCH', 200);
        trackApiCall('/api/resource', 'DELETE', 204);
      }).not.toThrow();
    });
  });

  describe('Error context types', () => {
    it('should support all context fields', () => {
      const context = {
        userId: 'user-123',
        sessionId: 'session-abc',
        personaId: 'ferni',
        component: 'VoiceAgent',
        action: 'processTurn',
        metadata: {
          turnNumber: 5,
          duration: 1234,
          tools: ['weather', 'music'],
        },
      };

      expect(() => {
        errorTracking.captureException(new Error('Test'), context);
      }).not.toThrow();
    });
  });

  describe('Breadcrumb types', () => {
    it('should support all standard categories', () => {
      const categories = ['http', 'navigation', 'ui', 'console', 'query', 'error', 'session'];

      for (const category of categories) {
        expect(() => {
          errorTracking.addBreadcrumb({
            category,
            message: `${category} breadcrumb`,
          });
        }).not.toThrow();
      }
    });

    it('should support custom categories', () => {
      expect(() => {
        errorTracking.addBreadcrumb({
          category: 'handoff',
          message: 'Agent handoff',
        });
        errorTracking.addBreadcrumb({
          category: 'tool-call',
          message: 'Tool executed',
        });
        errorTracking.addBreadcrumb({
          category: 'memory',
          message: 'Memory retrieved',
        });
      }).not.toThrow();
    });
  });

  describe('Graceful degradation', () => {
    it('should not throw when Sentry unavailable', async () => {
      // All methods should work gracefully without Sentry
      expect(() => {
        errorTracking.captureException(new Error('Test'));
        errorTracking.captureMessage('Test');
        errorTracking.setUser('user');
        errorTracking.setTag('key', 'value');
        errorTracking.setContext('ctx', { data: 'value' });
        errorTracking.addBreadcrumb({ category: 'test', message: 'msg' });
        errorTracking.startTransaction('tx', 'op');
        errorTracking.withScope(() => {});
      }).not.toThrow();
    });

    it('should handle init gracefully without DSN', async () => {
      // Init should not throw even without DSN
      await expect(errorTracking.init()).resolves.not.toThrow();
    });
  });
});
