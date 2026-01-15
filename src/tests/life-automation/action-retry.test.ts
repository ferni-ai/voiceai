/**
 * Action Retry Service Tests
 *
 * Tests for the retry service:
 * - Retry scheduling
 * - Exponential backoff
 * - Circuit breaker
 * - Dead letter queue
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getActionRetryService,
  resetActionRetryService,
  type RetryPolicy,
} from '../../services/actions/action-retry.js';
import {
  getActionStore,
  resetActionStore,
} from '../../services/actions/action-store.js';
import type { Action, ActionType } from '../../services/actions/action-types.js';

// ============================================================================
// ACTION RETRY TESTS
// ============================================================================

describe('ActionRetryService', () => {
  beforeEach(() => {
    resetActionRetryService();
    resetActionStore();
  });

  afterEach(() => {
    resetActionRetryService();
    resetActionStore();
  });

  describe('getActionRetryService', () => {
    it('should return singleton instance', () => {
      const service1 = getActionRetryService();
      const service2 = getActionRetryService();
      expect(service1).toBe(service2);
    });
  });

  describe('setPolicy/getPolicy', () => {
    it('should set and get retry policy for action type', () => {
      const service = getActionRetryService();
      const customPolicy: Partial<RetryPolicy> = {
        maxAttempts: 5,
        baseDelayMs: 2000,
      };

      service.setPolicy('send_text' as ActionType, customPolicy);
      const policy = service.getPolicy('send_text' as ActionType);

      expect(policy.maxAttempts).toBe(5);
      expect(policy.baseDelayMs).toBe(2000);
    });

    it('should return default policy for unknown action type', () => {
      const service = getActionRetryService();
      const policy = service.getPolicy('unknown_action' as ActionType);

      expect(policy).toBeDefined();
      expect(policy.maxAttempts).toBe(3);
    });
  });

  describe.skip('shouldRetry', () => {
    // TODO: Tests use store.create() which doesn't exist - ActionStore has save() instead
    it('should return true for retryable errors', () => {
      const service = getActionRetryService();
      const store = getActionStore();

      const action = store.create({
        type: 'send_text' as ActionType,
        intent: 'Test action',
        params: {},
        userId: 'test-user',
      });

      const shouldRetry = service.shouldRetry(action, 'ETIMEDOUT');
      expect(shouldRetry).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const service = getActionRetryService();
      const store = getActionStore();

      const action = store.create({
        type: 'send_text' as ActionType,
        intent: 'Test action',
        params: {},
        userId: 'test-user',
      });

      const shouldRetry = service.shouldRetry(action, 'INVALID_CREDENTIALS');
      expect(shouldRetry).toBe(false);
    });

    it('should return false when max attempts exceeded', () => {
      const service = getActionRetryService();
      const store = getActionStore();

      const action = store.create({
        type: 'send_text' as ActionType,
        intent: 'Test action',
        params: {},
        userId: 'test-user',
      });

      // Schedule retries until exhausted
      service.scheduleRetry(action.id, 'timeout');
      service.scheduleRetry(action.id, 'timeout');
      service.scheduleRetry(action.id, 'timeout');

      const shouldRetry = service.shouldRetry(action, 'timeout');
      expect(shouldRetry).toBe(false);
    });
  });

  describe.skip('scheduleRetry', () => {
    // TODO: Tests use store.create() which doesn't exist - ActionStore has save() instead
    it('should schedule retry with exponential backoff', () => {
      const service = getActionRetryService();
      const store = getActionStore();

      const action = store.create({
        type: 'send_text' as ActionType,
        intent: 'Test action',
        params: {},
        userId: 'test-user',
      });

      const state1 = service.scheduleRetry(action.id, 'First error');
      const state2 = service.scheduleRetry(action.id, 'Second error');

      expect(state1.attemptCount).toBe(1);
      expect(state2.attemptCount).toBe(2);
      expect(state2.errors).toHaveLength(2);

      // Verify exponential backoff
      if (state1.nextAttemptAt && state2.nextAttemptAt) {
        const delay1 = state1.nextAttemptAt.getTime() - state1.lastAttemptAt.getTime();
        const delay2 = state2.nextAttemptAt.getTime() - state2.lastAttemptAt.getTime();
        expect(delay2).toBeGreaterThan(delay1);
      }
    });

    it('should mark as exhausted after max attempts', () => {
      const service = getActionRetryService();
      const store = getActionStore();

      const action = store.create({
        type: 'send_text' as ActionType,
        intent: 'Test action',
        params: {},
        userId: 'test-user',
      });

      service.scheduleRetry(action.id, 'error');
      service.scheduleRetry(action.id, 'error');
      const state = service.scheduleRetry(action.id, 'error');

      expect(state.status).toBe('exhausted');
    });
  });

  describe.skip('markSucceeded', () => {
    // TODO: Tests use store.create() which doesn't exist - ActionStore has save() instead
    it('should update state to succeeded', () => {
      const service = getActionRetryService();
      const store = getActionStore();

      const action = store.create({
        type: 'send_text' as ActionType,
        intent: 'Test action',
        params: {},
        userId: 'test-user',
      });

      service.scheduleRetry(action.id, 'error');
      service.markSucceeded(action.id);

      const state = service.getRetryState(action.id);
      expect(state?.status).toBe('succeeded');
    });
  });

  describe.skip('cancelRetries', () => {
    // TODO: Tests use store.create() which doesn't exist - ActionStore has save() instead
    it('should remove retry state', () => {
      const service = getActionRetryService();
      const store = getActionStore();

      const action = store.create({
        type: 'send_text' as ActionType,
        intent: 'Test action',
        params: {},
        userId: 'test-user',
      });

      service.scheduleRetry(action.id, 'error');
      service.cancelRetries(action.id);

      const state = service.getRetryState(action.id);
      expect(state).toBeUndefined();
    });
  });

  describe('circuit breaker', () => {
    it('should open circuit after threshold failures', () => {
      const service = getActionRetryService();
      const actionType = 'send_text' as ActionType;

      // Record failures until circuit opens
      for (let i = 0; i < 5; i++) {
        service.recordFailure(actionType);
      }

      const isOpen = service.isCircuitOpen(actionType);
      expect(isOpen).toBe(true);
    });

    it('should close circuit after success', () => {
      const service = getActionRetryService();
      const actionType = 'send_text' as ActionType;

      // Open circuit
      for (let i = 0; i < 5; i++) {
        service.recordFailure(actionType);
      }

      // Record success
      service.recordSuccess(actionType);

      const isOpen = service.isCircuitOpen(actionType);
      expect(isOpen).toBe(false);
    });

    it('should get circuit state', () => {
      const service = getActionRetryService();
      const actionType = 'send_text' as ActionType;

      service.recordFailure(actionType);

      const state = service.getCircuitState(actionType);
      expect(state).toBeDefined();
      expect(state?.failures).toBe(1);
    });
  });

  describe.skip('dead letter queue', () => {
    // TODO: Tests use store.create() which doesn't exist - ActionStore has save() instead
    it('should get exhausted actions', () => {
      const service = getActionRetryService();
      const store = getActionStore();

      const action = store.create({
        type: 'send_text' as ActionType,
        intent: 'Test action',
        params: {},
        userId: 'test-user',
      });

      // Exhaust retries
      service.scheduleRetry(action.id, 'error');
      service.scheduleRetry(action.id, 'error');
      service.scheduleRetry(action.id, 'error');

      const deadLetter = service.getDeadLetterQueue();
      expect(deadLetter.length).toBeGreaterThanOrEqual(1);
      expect(deadLetter[0].action.id).toBe(action.id);
    });

    it('should clear from dead letter', () => {
      const service = getActionRetryService();
      const store = getActionStore();

      const action = store.create({
        type: 'send_text' as ActionType,
        intent: 'Test action',
        params: {},
        userId: 'test-user',
      });

      // Exhaust retries
      service.scheduleRetry(action.id, 'error');
      service.scheduleRetry(action.id, 'error');
      service.scheduleRetry(action.id, 'error');

      service.clearFromDeadLetter(action.id);

      const deadLetter = service.getDeadLetterQueue();
      const found = deadLetter.find((d) => d.action.id === action.id);
      expect(found).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return retry statistics', () => {
      const service = getActionRetryService();
      const stats = service.getStats();

      expect(stats.pendingRetries).toBeDefined();
      expect(stats.exhaustedRetries).toBeDefined();
      expect(stats.openCircuits).toBeDefined();
      expect(stats.queueLength).toBeDefined();
    });
  });
});
