/**
 * Circuit Breaker Tests
 *
 * Tests the circuit breaker pattern that prevents hammering slow/failing services.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { ServiceCircuitBreaker, circuitBreaker } from '../circuit-breaker.js';
import { DEFAULT_CIRCUIT_CONFIG } from '../types.js';

describe('Circuit Breaker', () => {
  let breaker: ServiceCircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new ServiceCircuitBreaker();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should start with closed circuit', () => {
      const state = breaker.getState('newService');

      expect(state.state).toBe('closed');
      expect(state.failures).toBe(0);
    });

    it('should not skip requests on closed circuit', () => {
      expect(breaker.shouldSkip('newService')).toBe(false);
    });
  });

  describe('Failure Tracking', () => {
    it('should track failures', () => {
      breaker.recordFailure('testService');
      breaker.recordFailure('testService');

      const state = breaker.getState('testService');

      expect(state.failures).toBe(2);
    });

    it('should open circuit after threshold failures', () => {
      const threshold = DEFAULT_CIRCUIT_CONFIG.failureThreshold;

      for (let i = 0; i < threshold; i++) {
        breaker.recordFailure('testService');
      }

      const state = breaker.getState('testService');

      expect(state.state).toBe('open');
      expect(breaker.shouldSkip('testService')).toBe(true);
    });

    it('should reset failure count for new failure window', () => {
      breaker.recordFailure('testService');
      breaker.recordFailure('testService');

      // Advance past failure window
      vi.advanceTimersByTime(DEFAULT_CIRCUIT_CONFIG.failureWindow + 1000);

      breaker.recordFailure('testService');

      const state = breaker.getState('testService');

      expect(state.failures).toBe(1); // Reset to 1
    });
  });

  describe('Success Tracking', () => {
    it('should track success rate', () => {
      breaker.recordSuccess('testService');
      breaker.recordSuccess('testService');
      breaker.recordSuccess('testService');

      const state = breaker.getState('testService');

      expect(state.successRate).toBeGreaterThan(0);
      expect(state.requestCount).toBe(3);
    });

    it('should decrease failures on success', () => {
      breaker.recordFailure('testService');
      breaker.recordFailure('testService');

      expect(breaker.getState('testService').failures).toBe(2);

      breaker.recordSuccess('testService');

      expect(breaker.getState('testService').failures).toBe(1);
    });
  });

  describe('Circuit State Transitions', () => {
    it('should transition from open to half-open after reset timeout', () => {
      // Open the circuit
      for (let i = 0; i < DEFAULT_CIRCUIT_CONFIG.failureThreshold; i++) {
        breaker.recordFailure('testService');
      }

      expect(breaker.getState('testService').state).toBe('open');
      expect(breaker.shouldSkip('testService')).toBe(true);

      // Advance past reset timeout
      vi.advanceTimersByTime(DEFAULT_CIRCUIT_CONFIG.resetTimeout + 1000);

      // shouldSkip will transition to half-open and return false
      expect(breaker.shouldSkip('testService')).toBe(false);
      expect(breaker.getState('testService').state).toBe('half-open');
    });

    it('should close circuit after success in half-open state', () => {
      // Open the circuit
      for (let i = 0; i < DEFAULT_CIRCUIT_CONFIG.failureThreshold; i++) {
        breaker.recordFailure('testService');
      }

      // Transition to half-open
      vi.advanceTimersByTime(DEFAULT_CIRCUIT_CONFIG.resetTimeout + 1000);
      breaker.shouldSkip('testService'); // Triggers transition

      expect(breaker.getState('testService').state).toBe('half-open');

      // Success closes the circuit
      breaker.recordSuccess('testService');

      expect(breaker.getState('testService').state).toBe('closed');
      expect(breaker.getState('testService').failures).toBe(0);
    });

    it('should reopen circuit after failure in half-open state', () => {
      // Open the circuit
      for (let i = 0; i < DEFAULT_CIRCUIT_CONFIG.failureThreshold; i++) {
        breaker.recordFailure('testService');
      }

      // Transition to half-open
      vi.advanceTimersByTime(DEFAULT_CIRCUIT_CONFIG.resetTimeout + 1000);
      breaker.shouldSkip('testService');

      expect(breaker.getState('testService').state).toBe('half-open');

      // Failure reopens the circuit
      breaker.recordFailure('testService');

      expect(breaker.getState('testService').state).toBe('open');
    });
  });

  describe('Latency Tracking', () => {
    it('should track average latency', () => {
      breaker.recordLatency('testService', 100);
      breaker.recordLatency('testService', 200);
      breaker.recordLatency('testService', 300);

      const state = breaker.getState('testService');

      // Exponential moving average: 100 → 130 → 181
      expect(state.avgLatency).toBeGreaterThan(100);
      expect(state.avgLatency).toBeLessThan(300);
    });

    it('should open circuit for consistently slow responses', () => {
      const slowThreshold = DEFAULT_CIRCUIT_CONFIG.slowThreshold;
      const slowCount = DEFAULT_CIRCUIT_CONFIG.slowThreshold_count;

      // Record many slow responses
      for (let i = 0; i < slowCount * 3; i++) {
        breaker.recordLatency('testService', slowThreshold + 1000);
      }

      const state = breaker.getState('testService');

      expect(state.state).toBe('open');
    });

    it('should not open circuit for occasional slow responses', () => {
      const slowThreshold = DEFAULT_CIRCUIT_CONFIG.slowThreshold;

      // Most responses are fast
      for (let i = 0; i < 10; i++) {
        breaker.recordLatency('testService', 100);
      }

      // One slow response
      breaker.recordLatency('testService', slowThreshold + 1000);

      const state = breaker.getState('testService');

      expect(state.state).toBe('closed');
    });
  });

  describe('Manual Operations', () => {
    it('should manually reset a circuit', () => {
      // Open the circuit
      for (let i = 0; i < DEFAULT_CIRCUIT_CONFIG.failureThreshold; i++) {
        breaker.recordFailure('testService');
      }

      expect(breaker.getState('testService').state).toBe('open');

      breaker.reset('testService');

      expect(breaker.getState('testService').state).toBe('closed');
      expect(breaker.getState('testService').failures).toBe(0);
    });

    it('should reset all circuits', () => {
      // Open multiple circuits
      for (let i = 0; i < DEFAULT_CIRCUIT_CONFIG.failureThreshold; i++) {
        breaker.recordFailure('service1');
        breaker.recordFailure('service2');
      }

      breaker.resetAll();

      expect(breaker.getState('service1').state).toBe('closed');
      expect(breaker.getState('service2').state).toBe('closed');
    });
  });

  describe('Health Summary', () => {
    it('should return health summary', () => {
      // Healthy service
      breaker.recordSuccess('healthyService');

      // Degraded service (half-open or low success rate)
      breaker.recordFailure('degradedService');
      breaker.recordSuccess('degradedService');
      breaker.recordFailure('degradedService');

      // Unhealthy service (open circuit)
      for (let i = 0; i < DEFAULT_CIRCUIT_CONFIG.failureThreshold; i++) {
        breaker.recordFailure('unhealthyService');
      }

      const summary = breaker.getHealthSummary();

      expect(summary.healthy).toContain('healthyService');
      expect(summary.unhealthy).toContain('unhealthyService');
    });

    it('should get all circuit states', () => {
      breaker.recordSuccess('service1');
      breaker.recordSuccess('service2');

      const states = breaker.getAllStates();

      expect(states.length).toBe(2);
      expect(states.map((s) => s.service)).toContain('service1');
      expect(states.map((s) => s.service)).toContain('service2');
    });
  });

  describe('Configuration', () => {
    it('should allow configuration updates', () => {
      breaker.setConfig({ failureThreshold: 10 });

      // Should now need 10 failures to open
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('testService');
      }

      expect(breaker.getState('testService').state).toBe('closed');
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton circuit breaker', () => {
      circuitBreaker.recordSuccess('singletonTest');

      const state = circuitBreaker.getState('singletonTest');

      expect(state.requestCount).toBeGreaterThan(0);

      // Reset for other tests
      circuitBreaker.reset('singletonTest');
    });
  });
});
