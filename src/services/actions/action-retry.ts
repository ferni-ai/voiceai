/**
 * Action Retry Service
 *
 * Provides intelligent retry logic for failed actions:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Per-action-type retry policies
 * - Dead letter queue for permanent failures
 *
 * @module services/actions/action-retry
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getActionStore } from './action-store.js';
import type { Action, ActionType, ActionStatus } from './action-types.js';

const log = createLogger({ module: 'action-retry' });

// ============================================================================
// TYPES
// ============================================================================

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterPercent: number; // 0-100
  retryableErrors: string[]; // Error messages/codes that are retryable
}

export interface RetryState {
  actionId: string;
  attemptCount: number;
  lastAttemptAt: Date;
  nextAttemptAt: Date | null;
  errors: Array<{ timestamp: Date; error: string }>;
  status: 'pending' | 'retrying' | 'exhausted' | 'succeeded';
}

export interface CircuitBreakerState {
  actionType: ActionType;
  failures: number;
  lastFailure: Date | null;
  isOpen: boolean;
  openedAt: Date | null;
  halfOpenAt: Date | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterPercent: 20,
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'rate limit',
    'timeout',
    'temporary',
    '503',
    '502',
    '504',
  ],
};

const CIRCUIT_BREAKER_THRESHOLD = 5; // Failures before opening
const CIRCUIT_BREAKER_RESET_MS = 60000; // Time before trying again

// ============================================================================
// RETRY SERVICE CLASS
// ============================================================================

export class ActionRetryService {
  private retryStates: Map<string, RetryState> = new Map();
  private circuitBreakers: Map<ActionType, CircuitBreakerState> = new Map();
  private policies: Map<ActionType, RetryPolicy> = new Map();
  private retryQueue: Array<{ actionId: string; scheduledFor: Date }> = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private store = getActionStore();

  constructor() {
    log.info('Action retry service initialized');
  }

  // ==========================================================================
  // POLICY MANAGEMENT
  // ==========================================================================

  /**
   * Set retry policy for an action type
   */
  setPolicy(actionType: ActionType, policy: Partial<RetryPolicy>): void {
    this.policies.set(actionType, { ...DEFAULT_RETRY_POLICY, ...policy });
    log.debug({ actionType }, 'Retry policy set');
  }

  /**
   * Get retry policy for an action type
   */
  getPolicy(actionType: ActionType): RetryPolicy {
    return this.policies.get(actionType) || DEFAULT_RETRY_POLICY;
  }

  // ==========================================================================
  // RETRY LOGIC
  // ==========================================================================

  /**
   * Check if an action should be retried
   */
  shouldRetry(action: Action, error: string): boolean {
    // Check circuit breaker
    if (this.isCircuitOpen(action.type)) {
      log.debug({ actionType: action.type }, 'Circuit breaker is open');
      return false;
    }

    const policy = this.getPolicy(action.type);
    const state = this.retryStates.get(action.id);
    const attemptCount = state?.attemptCount || 0;

    // Check max attempts
    if (attemptCount >= policy.maxAttempts) {
      log.debug(
        { actionId: action.id, attemptCount, maxAttempts: policy.maxAttempts },
        'Max retry attempts exceeded'
      );
      return false;
    }

    // Check if error is retryable
    const errorLower = error.toLowerCase();
    const isRetryable = policy.retryableErrors.some((e) => errorLower.includes(e.toLowerCase()));

    if (!isRetryable) {
      log.debug({ actionId: action.id, error }, 'Error is not retryable');
    }

    return isRetryable;
  }

  /**
   * Schedule a retry for an action
   */
  scheduleRetry(actionId: string, error: string): RetryState {
    const action = this.store.get(actionId);
    if (!action) {
      throw new Error('Action not found');
    }

    const policy = this.getPolicy(action.type);
    const existingState = this.retryStates.get(actionId);
    const attemptCount = (existingState?.attemptCount || 0) + 1;

    // Calculate delay with exponential backoff and jitter
    const baseDelay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attemptCount - 1);
    const jitterMs = ((baseDelay * policy.jitterPercent) / 100) * (Math.random() * 2 - 1);
    const delayMs = Math.min(baseDelay + jitterMs, policy.maxDelayMs);

    const nextAttemptAt = new Date(Date.now() + delayMs);

    const state: RetryState = {
      actionId,
      attemptCount,
      lastAttemptAt: new Date(),
      nextAttemptAt,
      errors: [...(existingState?.errors || []), { timestamp: new Date(), error }],
      status: attemptCount >= policy.maxAttempts ? 'exhausted' : 'pending',
    };

    this.retryStates.set(actionId, state);

    // Add to retry queue
    if (state.status !== 'exhausted') {
      this.retryQueue.push({ actionId, scheduledFor: nextAttemptAt });
      this.retryQueue.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
    }

    log.info(
      {
        actionId,
        attemptCount,
        nextAttemptAt: nextAttemptAt.toISOString(),
        delayMs: Math.round(delayMs),
      },
      'Retry scheduled'
    );

    return state;
  }

  /**
   * Get retry state for an action
   */
  getRetryState(actionId: string): RetryState | undefined {
    return this.retryStates.get(actionId);
  }

  /**
   * Mark retry as succeeded
   */
  markSucceeded(actionId: string): void {
    const state = this.retryStates.get(actionId);
    if (state) {
      state.status = 'succeeded';
      state.nextAttemptAt = null;
    }

    // Remove from retry queue
    this.retryQueue = this.retryQueue.filter((r) => r.actionId !== actionId);
  }

  /**
   * Cancel retries for an action
   */
  cancelRetries(actionId: string): void {
    this.retryStates.delete(actionId);
    this.retryQueue = this.retryQueue.filter((r) => r.actionId !== actionId);
    log.debug({ actionId }, 'Retries cancelled');
  }

  // ==========================================================================
  // CIRCUIT BREAKER
  // ==========================================================================

  /**
   * Record a failure for circuit breaker
   */
  recordFailure(actionType: ActionType): void {
    let state = this.circuitBreakers.get(actionType);

    if (!state) {
      state = {
        actionType,
        failures: 0,
        lastFailure: null,
        isOpen: false,
        openedAt: null,
        halfOpenAt: null,
      };
      this.circuitBreakers.set(actionType, state);
    }

    state.failures++;
    state.lastFailure = new Date();

    // Check if we should open the circuit
    if (!state.isOpen && state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      state.isOpen = true;
      state.openedAt = new Date();
      state.halfOpenAt = new Date(Date.now() + CIRCUIT_BREAKER_RESET_MS);

      log.warn({ actionType, failures: state.failures }, 'Circuit breaker opened');
    }
  }

  /**
   * Record a success for circuit breaker
   */
  recordSuccess(actionType: ActionType): void {
    const state = this.circuitBreakers.get(actionType);
    if (state) {
      state.failures = 0;
      state.isOpen = false;
      state.openedAt = null;
      state.halfOpenAt = null;
    }
  }

  /**
   * Check if circuit is open
   */
  isCircuitOpen(actionType: ActionType): boolean {
    const state = this.circuitBreakers.get(actionType);
    if (!state || !state.isOpen) {
      return false;
    }

    // Check if we're in half-open state (ready to try again)
    if (state.halfOpenAt && Date.now() >= state.halfOpenAt.getTime()) {
      log.info({ actionType }, 'Circuit breaker in half-open state');
      return false; // Allow one attempt
    }

    return true;
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(actionType: ActionType): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(actionType);
  }

  // ==========================================================================
  // QUEUE PROCESSING
  // ==========================================================================

  /**
   * Start processing the retry queue
   */
  startProcessing(processor: (actionId: string) => Promise<void>): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(async () => {
      const now = Date.now();
      const dueItems = this.retryQueue.filter((r) => r.scheduledFor.getTime() <= now);

      for (const item of dueItems) {
        // Remove from queue
        this.retryQueue = this.retryQueue.filter((r) => r.actionId !== item.actionId);

        const state = this.retryStates.get(item.actionId);
        if (state && state.status === 'pending') {
          state.status = 'retrying';

          try {
            await processor(item.actionId);
          } catch (error) {
            log.error({ error: String(error), actionId: item.actionId }, 'Retry processor error');
          }
        }
      }
    }, 1000); // Check every second

    log.info('Retry queue processing started');
  }

  /**
   * Stop processing the retry queue
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      log.info('Retry queue processing stopped');
    }
  }

  // ==========================================================================
  // DEAD LETTER QUEUE
  // ==========================================================================

  /**
   * Get actions that have exhausted all retries
   */
  getDeadLetterQueue(): Array<{ action: Action; retryState: RetryState }> {
    const result: Array<{ action: Action; retryState: RetryState }> = [];

    for (const [actionId, state] of this.retryStates) {
      if (state.status === 'exhausted') {
        const action = this.store.get(actionId);
        if (action) {
          result.push({ action, retryState: state });
        }
      }
    }

    return result;
  }

  /**
   * Clear an item from the dead letter queue
   */
  clearFromDeadLetter(actionId: string): void {
    this.retryStates.delete(actionId);
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get retry statistics
   */
  getStats(): {
    pendingRetries: number;
    exhaustedRetries: number;
    openCircuits: number;
    queueLength: number;
  } {
    let pendingRetries = 0;
    let exhaustedRetries = 0;

    for (const state of this.retryStates.values()) {
      if (state.status === 'pending' || state.status === 'retrying') {
        pendingRetries++;
      } else if (state.status === 'exhausted') {
        exhaustedRetries++;
      }
    }

    const openCircuits = Array.from(this.circuitBreakers.values()).filter((cb) => cb.isOpen).length;

    return {
      pendingRetries,
      exhaustedRetries,
      openCircuits,
      queueLength: this.retryQueue.length,
    };
  }

  /**
   * Clear all state (for testing)
   */
  clearAll(): void {
    this.retryStates.clear();
    this.circuitBreakers.clear();
    this.retryQueue = [];
    this.stopProcessing();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let retryServiceInstance: ActionRetryService | null = null;

export function getActionRetryService(): ActionRetryService {
  if (!retryServiceInstance) {
    retryServiceInstance = new ActionRetryService();
  }
  return retryServiceInstance;
}

export function resetActionRetryService(): void {
  if (retryServiceInstance) {
    retryServiceInstance.clearAll();
  }
  retryServiceInstance = null;
}
