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
export declare class HandoffTransaction {
    private id;
    private steps;
    private executedSteps;
    private state;
    private startTime;
    constructor(id: string);
    /**
     * Add a step to the transaction.
     */
    addStep<T>(step: TransactionStep<T>): this;
    /**
     * Execute all steps in order.
     * If a critical step fails, roll back all previous steps.
     */
    execute<T>(): Promise<TransactionResult<T>>;
    /**
     * Roll back all executed steps in reverse order.
     */
    rollback(): Promise<void>;
    /**
     * Get current transaction state.
     */
    getState(): TransactionState;
    /**
     * Get transaction ID.
     */
    getId(): string;
}
/**
 * Create a new handoff transaction with auto-generated ID.
 */
export declare function createTransaction(prefix?: string): HandoffTransaction;
/**
 * Create a state update step.
 */
export declare function createStateStep(setAgent: (agent: AgentId) => void, newAgent: AgentId, previousAgent: AgentId): TransactionStep<void>;
/**
 * Create a voice switch step.
 */
export declare function createVoiceSwitchStep(switchVoice: (agent: string) => void, newAgent: string, previousAgent: string): TransactionStep<void>;
/**
 * Create an LLM instructions update step.
 */
export declare function createInstructionsStep(setInstructions: (instructions: string) => void, newInstructions: string, previousInstructions: string): TransactionStep<void>;
/**
 * Create a notification step (non-critical).
 */
export declare function createNotificationStep(sendNotification: () => Promise<void>): TransactionStep<void>;
export default HandoffTransaction;
//# sourceMappingURL=handoff-transaction.d.ts.map