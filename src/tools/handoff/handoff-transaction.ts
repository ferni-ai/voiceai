/**
 * Handoff Transaction
 *
 * Implements atomic commit/rollback pattern for handoffs.
 * If any step fails, all previous steps are rolled back.
 *
 * This ensures the system never ends up in an inconsistent state
 * where voice, LLM identity, and state don't match.
 *
 * @module handoff/handoff-transaction
 */

import type { AgentId } from '../../services/agent-bus.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single step in the handoff transaction.
 */
export interface TransactionStep<T = unknown> {
  /** Step name for logging */
  name: string;
  /** Execute the step */
  execute: () => Promise<T>;
  /** Rollback the step (called if later step fails) */
  rollback: () => Promise<void>;
  /** Whether this step is critical (failure = abort) */
  critical?: boolean;
}

/**
 * Transaction state.
 */
export type TransactionState = 'pending' | 'executing' | 'committed' | 'rolled_back' | 'failed';

/**
 * Step execution result.
 */
export interface StepResult<T = unknown> {
  step: string;
  success: boolean;
  result?: T;
  error?: string;
  durationMs: number;
}

/**
 * Transaction execution result.
 */
export interface TransactionResult<T = unknown> {
  success: boolean;
  state: TransactionState;
  results: StepResult[];
  finalResult?: T;
  error?: string;
  totalDurationMs: number;
  rolledBack?: boolean;
}

// ============================================================================
// TRANSACTION CLASS
// ============================================================================

/**
 * Handoff Transaction Manager
 *
 * Executes a series of steps atomically. If any critical step fails,
 * all previous steps are rolled back in reverse order.
 *
 * @example
 * ```typescript
 * const tx = new HandoffTransaction('ferni-to-peter');
 *
 * tx.addStep({
 *   name: 'update-state',
 *   execute: async () => setCurrentAgent('peter-john'),
 *   rollback: async () => setCurrentAgent('ferni'),
 *   critical: true,
 * });
 *
 * tx.addStep({
 *   name: 'switch-voice',
 *   execute: async () => switchVoice('peter-john'),
 *   rollback: async () => switchVoice('ferni'),
 *   critical: true,
 * });
 *
 * const result = await tx.execute();
 * if (!result.success) {
 *   console.error('Handoff failed:', result.error);
 *   // State is already rolled back
 * }
 * ```
 */
export class HandoffTransaction {
  private id: string;
  private steps: TransactionStep[] = [];
  private executedSteps: TransactionStep[] = [];
  private state: TransactionState = 'pending';
  private startTime: number = 0;

  constructor(id: string) {
    this.id = id;
    log.debug({ transactionId: id }, '📝 Created handoff transaction');
  }

  /**
   * Add a step to the transaction.
   */
  addStep<T>(step: TransactionStep<T>): this {
    if (this.state !== 'pending') {
      throw new Error(`Cannot add steps to transaction in state: ${this.state}`);
    }
    this.steps.push(step);
    log.debug(
      { transactionId: this.id, step: step.name, critical: step.critical },
      '  + Added step'
    );
    return this;
  }

  /**
   * Execute all steps in order.
   * If a critical step fails, roll back all previous steps.
   */
  async execute<T>(): Promise<TransactionResult<T>> {
    if (this.state !== 'pending') {
      return {
        success: false,
        state: this.state,
        results: [],
        error: `Transaction already in state: ${this.state}`,
        totalDurationMs: 0,
      };
    }

    this.state = 'executing';
    this.startTime = Date.now();
    const results: StepResult[] = [];
    let finalResult: T | undefined;

    log.info(
      { transactionId: this.id, stepCount: this.steps.length },
      '🚀 Starting handoff transaction'
    );

    try {
      for (const step of this.steps) {
        const stepStart = Date.now();

        try {
          log.debug({ transactionId: this.id, step: step.name }, '  → Executing step');

          const result = await step.execute();

          const stepDuration = Date.now() - stepStart;
          results.push({
            step: step.name,
            success: true,
            result,
            durationMs: stepDuration,
          });

          // Track executed steps for potential rollback
          this.executedSteps.push(step);
          finalResult = result as T;

          log.debug(
            { transactionId: this.id, step: step.name, durationMs: stepDuration },
            '  ✓ Step completed'
          );
        } catch (err) {
          const stepDuration = Date.now() - stepStart;
          const errorMsg = err instanceof Error ? err.message : String(err);

          results.push({
            step: step.name,
            success: false,
            error: errorMsg,
            durationMs: stepDuration,
          });

          log.error(
            { transactionId: this.id, step: step.name, error: errorMsg },
            '  ✗ Step FAILED'
          );

          // If critical, roll back everything
          if (step.critical !== false) {
            log.warn(
              { transactionId: this.id, step: step.name },
              '  ⏪ Critical step failed - initiating rollback'
            );

            await this.rollback();

            return {
              success: false,
              state: this.state,
              results,
              error: `Critical step "${step.name}" failed: ${errorMsg}`,
              totalDurationMs: Date.now() - this.startTime,
              rolledBack: true,
            };
          }

          // Non-critical failure - log and continue
          log.warn(
            { transactionId: this.id, step: step.name },
            '  ⚠️ Non-critical step failed - continuing'
          );
        }
      }

      // All steps completed successfully
      this.state = 'committed';

      log.info(
        {
          transactionId: this.id,
          totalDurationMs: Date.now() - this.startTime,
          steps: results.map((r) => ({ name: r.step, success: r.success, durationMs: r.durationMs })),
        },
        '✅ Handoff transaction COMMITTED'
      );

      return {
        success: true,
        state: this.state,
        results,
        finalResult,
        totalDurationMs: Date.now() - this.startTime,
      };
    } catch (err) {
      // Unexpected error during execution
      this.state = 'failed';
      const errorMsg = err instanceof Error ? err.message : String(err);

      log.error(
        { transactionId: this.id, error: errorMsg },
        '🚨 Transaction execution failed unexpectedly'
      );

      // Attempt rollback
      await this.rollback();

      return {
        success: false,
        state: this.state,
        results,
        error: `Transaction failed: ${errorMsg}`,
        totalDurationMs: Date.now() - this.startTime,
        rolledBack: true,
      };
    }
  }

  /**
   * Roll back all executed steps in reverse order.
   */
  async rollback(): Promise<void> {
    if (this.executedSteps.length === 0) {
      log.debug({ transactionId: this.id }, '  No steps to roll back');
      return;
    }

    log.info(
      { transactionId: this.id, stepCount: this.executedSteps.length },
      '⏪ Rolling back transaction'
    );

    // Roll back in reverse order
    const stepsToRollback = [...this.executedSteps].reverse();

    for (const step of stepsToRollback) {
      try {
        log.debug({ transactionId: this.id, step: step.name }, '  ← Rolling back step');
        await step.rollback();
        log.debug({ transactionId: this.id, step: step.name }, '  ✓ Rollback complete');
      } catch (err) {
        // Log but continue rollback of other steps
        log.error(
          { transactionId: this.id, step: step.name, error: String(err) },
          '  ✗ Rollback FAILED for step (continuing with others)'
        );
      }
    }

    this.state = 'rolled_back';
    this.executedSteps = [];

    log.info({ transactionId: this.id }, '⏪ Transaction ROLLED BACK');
  }

  /**
   * Get current transaction state.
   */
  getState(): TransactionState {
    return this.state;
  }

  /**
   * Get transaction ID.
   */
  getId(): string {
    return this.id;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new handoff transaction with auto-generated ID.
 */
export function createTransaction(prefix: string = 'handoff'): HandoffTransaction {
  const id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return new HandoffTransaction(id);
}

/**
 * Create a state update step.
 */
export function createStateStep(
  setAgent: (agent: AgentId) => void,
  newAgent: AgentId,
  previousAgent: AgentId
): TransactionStep<void> {
  return {
    name: 'update-state',
    execute: async () => setAgent(newAgent),
    rollback: async () => setAgent(previousAgent),
    critical: true,
  };
}

/**
 * Create a voice switch step.
 */
export function createVoiceSwitchStep(
  switchVoice: (agent: string) => void,
  newAgent: string,
  previousAgent: string
): TransactionStep<void> {
  return {
    name: 'switch-voice',
    execute: async () => switchVoice(newAgent),
    rollback: async () => switchVoice(previousAgent),
    critical: true,
  };
}

/**
 * Create an LLM instructions update step.
 */
export function createInstructionsStep(
  setInstructions: (instructions: string) => void,
  newInstructions: string,
  previousInstructions: string
): TransactionStep<void> {
  return {
    name: 'update-instructions',
    execute: async () => setInstructions(newInstructions),
    rollback: async () => setInstructions(previousInstructions),
    critical: true,
  };
}

/**
 * Create a notification step (non-critical).
 */
export function createNotificationStep(
  sendNotification: () => Promise<void>
): TransactionStep<void> {
  return {
    name: 'send-notification',
    execute: sendNotification,
    rollback: async () => {
      // Notifications typically can't be rolled back
    },
    critical: false,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default HandoffTransaction;

