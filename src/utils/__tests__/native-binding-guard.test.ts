/**
 * Native Binding Guard Tests
 *
 * Tests the circuit breaker and crash protection for native bindings
 * (ONNX, WASM, NAPI).
 *
 * @module utils/__tests__/native-binding-guard.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NativeBindingGuard,
  NativeBindingError,
  getNativeBindingGuard,
  getAllNativeBindingStats,
  resetAllCircuitBreakers,
  getOnnxGuard,
  getTransformersGuard,
  getVadGuard,
} from '../native-binding-guard.js';

// Mock safe-logger
vi.mock('../safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('NativeBindingGuard', () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should execute successful operations', async () => {
      const guard = new NativeBindingGuard({ name: 'test' });
      const result = await guard.execute('test-op', async () => 'success');
      expect(result).toBe('success');
    });

    it('should pass through errors and record failures', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 5,
      });

      await expect(
        guard.execute('test-op', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow(NativeBindingError);

      const stats = guard.getStats();
      expect(stats.failedCalls).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
    });

    it('should track call statistics', async () => {
      const guard = new NativeBindingGuard({ name: 'test' });
      await guard.execute('op1', async () => 'ok');
      await guard.execute('op2', async () => 'ok');

      const stats = guard.getStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.successfulCalls).toBe(2);
      expect(stats.state).toBe('closed');
    });

    it('should track latency metrics', async () => {
      const guard = new NativeBindingGuard({ name: 'test' });

      await guard.execute('op1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'ok';
      });

      const stats = guard.getStats();
      expect(stats.averageLatencyMs).toBeGreaterThan(0);
    });
  });

  describe('circuit breaker states', () => {
    it('should open circuit after failure threshold', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 2,
        resetTimeMs: 1000,
      });

      // First failure
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      // Second failure - should open circuit
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      const stats = guard.getStats();
      expect(stats.state).toBe('open');

      // Third call should throw circuit_open error
      await expect(guard.execute('op', async () => 'ok')).rejects.toThrow(NativeBindingError);
    });

    it('should transition to half-open after reset timeout', async () => {
      vi.useFakeTimers();

      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 2,
        resetTimeMs: 1000,
      });

      // Open the circuit
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      expect(guard.getStats().state).toBe('open');

      // Advance time past reset timeout
      vi.advanceTimersByTime(1100);

      // Should allow one request (half-open)
      const result = await guard.execute('op', async () => 'recovered');
      expect(result).toBe('recovered');
    });

    it('should close circuit after 3 consecutive successes in half-open', async () => {
      vi.useFakeTimers();

      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 2,
        resetTimeMs: 1000,
      });

      // Open the circuit
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      // Advance to half-open
      vi.advanceTimersByTime(1100);

      // Three successes to close circuit
      await guard.execute('op', async () => 'ok');
      await guard.execute('op', async () => 'ok');
      await guard.execute('op', async () => 'ok');

      expect(guard.getStats().state).toBe('closed');
    });

    it('should return to open state if half-open test fails', async () => {
      vi.useFakeTimers();

      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 2,
        resetTimeMs: 1000,
      });

      // Open the circuit
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      // Advance to half-open
      vi.advanceTimersByTime(1100);

      // Fail in half-open - should go back to open
      await expect(
        guard.execute('op', async () => {
          throw new Error('still failing');
        })
      ).rejects.toThrow();

      expect(guard.getStats().state).toBe('open');
    });
  });

  describe('fallback execution', () => {
    it('should use fallback when circuit is open', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 1,
        resetTimeMs: 60000,
      });

      // Open the circuit
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      // Next call should use fallback
      const result = await guard.execute(
        'op',
        async () => 'main',
        () => 'fallback'
      );

      expect(result).toBe('fallback');
    });

    it('should use fallback when main function fails', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 5, // Won't open circuit
      });

      const result = await guard.execute(
        'op',
        async () => {
          throw new Error('fail');
        },
        () => 'fallback'
      );

      expect(result).toBe('fallback');
    });

    it('should throw if fallback also fails', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 5,
      });

      await expect(
        guard.execute(
          'op',
          async () => {
            throw new Error('main fail');
          },
          async () => {
            throw new Error('fallback fail');
          }
        )
      ).rejects.toThrow('fallback fail');
    });
  });

  describe('timeout protection', () => {
    it('should timeout slow operations', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        timeoutMs: 100,
        failureThreshold: 5,
      });

      await expect(
        guard.execute('slow-op', async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return 'done';
        })
      ).rejects.toThrow(NativeBindingError);

      const stats = guard.getStats();
      expect(stats.timeoutCalls).toBe(1);
    });

    it('should record timeout as a failure', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        timeoutMs: 50,
        failureThreshold: 5,
      });

      await expect(
        guard.execute('slow-op', async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'done';
        })
      ).rejects.toThrow();

      const stats = guard.getStats();
      expect(stats.consecutiveFailures).toBe(1);
    });
  });

  describe('crash diagnostics', () => {
    it('should capture crash diagnostics on failure', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 5,
        captureStackTrace: true,
      });

      let diagnostics: any = null;
      guard.on('crash', (d) => {
        diagnostics = d;
      });

      await expect(
        guard.execute(
          'failing-op',
          async () => {
            throw new Error('test crash');
          },
          undefined,
          'test input'
        )
      ).rejects.toThrow();

      expect(diagnostics).not.toBeNull();
      expect(diagnostics.bindingName).toBe('test');
      expect(diagnostics.operation).toBe('failing-op');
      expect(diagnostics.errorMessage).toBe('test crash');
      expect(diagnostics.inputSummary).toBe('test input');
    });

    it('should detect native crash patterns', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 5,
      });

      let diagnostics: any = null;
      guard.on('crash', (d) => {
        diagnostics = d;
      });

      await expect(
        guard.execute('native-crash', async () => {
          throw new Error('SIGSEGV: segmentation fault');
        })
      ).rejects.toThrow();

      expect(diagnostics.errorType).toBe('native_crash');
      expect(diagnostics.recoveryAction).toBe('fatal');
    });

    it('should detect OOM patterns', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 5,
      });

      let diagnostics: any = null;
      guard.on('crash', (d) => {
        diagnostics = d;
      });

      await expect(
        guard.execute('oom-crash', async () => {
          throw new Error('allocation failed: out of memory');
        })
      ).rejects.toThrow();

      expect(diagnostics.errorType).toBe('oom');
    });
  });

  describe('health checks', () => {
    it('should report healthy when circuit is closed', () => {
      const guard = new NativeBindingGuard({ name: 'test' });
      expect(guard.isHealthy()).toBe(true);
    });

    it('should report unhealthy when circuit is open', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 1,
      });

      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      expect(guard.isHealthy()).toBe(false);
    });
  });

  describe('manual reset', () => {
    it('should reset circuit to closed state', async () => {
      const guard = new NativeBindingGuard({
        name: 'test',
        failureThreshold: 1,
      });

      // Open the circuit
      await expect(
        guard.execute('op', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow();

      expect(guard.getStats().state).toBe('open');

      // Reset
      guard.reset();

      expect(guard.getStats().state).toBe('closed');
    });
  });

  describe('registry functions', () => {
    it('should get or create guards by name', () => {
      const guard1 = getNativeBindingGuard({ name: 'binding-a' });
      const guard2 = getNativeBindingGuard({ name: 'binding-a' });

      expect(guard1).toBe(guard2);
    });

    it('should create different guards for different names', () => {
      const guard1 = getNativeBindingGuard({ name: 'binding-a' });
      const guard2 = getNativeBindingGuard({ name: 'binding-b' });

      expect(guard1).not.toBe(guard2);
    });

    it('should get stats for all guards', async () => {
      const guard1 = getNativeBindingGuard({ name: 'binding-1' });
      const guard2 = getNativeBindingGuard({ name: 'binding-2' });

      await guard1.execute('op', async () => 'ok');
      await guard2.execute('op', async () => 'ok');
      await guard2.execute('op', async () => 'ok');

      const stats = getAllNativeBindingStats();
      expect(stats.length).toBeGreaterThanOrEqual(2);
      expect(stats.find((s) => s.name === 'binding-1')?.totalCalls).toBe(1);
      expect(stats.find((s) => s.name === 'binding-2')?.totalCalls).toBe(2);
    });
  });

  describe('pre-configured guards', () => {
    it('should provide ONNX guard with appropriate config', () => {
      const guard = getOnnxGuard();
      expect(guard).toBeDefined();
      expect(guard.getStats().name).toBe('onnx-runtime');
    });

    it('should provide Transformers guard with appropriate config', () => {
      const guard = getTransformersGuard();
      expect(guard).toBeDefined();
      expect(guard.getStats().name).toBe('transformers-js');
    });

    it('should provide VAD guard with appropriate config', () => {
      const guard = getVadGuard();
      expect(guard).toBeDefined();
      expect(guard.getStats().name).toBe('silero-vad');
    });
  });

  describe('NativeBindingError', () => {
    it('should include binding name and operation', async () => {
      const guard = new NativeBindingGuard({
        name: 'test-binding',
        failureThreshold: 5,
      });

      try {
        await guard.execute('test-operation', async () => {
          throw new Error('test error');
        });
      } catch (error) {
        expect(error).toBeInstanceOf(NativeBindingError);
        const nativeError = error as NativeBindingError;
        expect(nativeError.bindingName).toBe('test-binding');
        expect(nativeError.operation).toBe('test-operation');
        expect(nativeError.errorType).toBe('exception');
      }
    });
  });
});
