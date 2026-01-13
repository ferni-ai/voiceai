/**
 * Store Hooks for Auto-Indexing
 *
 * When domain stores change data, they call these hooks to trigger
 * automatic re-indexing to semantic memory.
 *
 * This ensures semantic search always has up-to-date data without
 * manual sync calls.
 *
 * @module services/data-layer/store-hooks
 */
import type { ChangeType, StoreChangeEvent } from './types.js';
export type { ChangeType, EntityType, StoreChangeEvent, StoreType } from './types.js';
/**
 * Indexing metrics type
 */
export interface IndexingMetrics {
    pendingCount: number;
    indexedCount: number;
    skippedCount: number;
    errorCount: number;
    lastFlushTime: Date | undefined;
}
/**
 * Get indexing metrics
 */
export declare function getIndexingMetrics(): IndexingMetrics;
/**
 * Reset metrics (for testing)
 */
export declare function resetMetrics(): void;
/**
 * Queue metrics for backpressure monitoring
 */
export interface QueueMetrics {
    pendingIndexes: number;
    activeTimers: number;
    successRate: number;
    totalOperations: number;
    lastFlushTime: string | null;
    oldestPendingAge: number | null;
    pendingByStore: Record<string, number>;
    pendingByEntity: Record<string, number>;
}
/**
 * Get detailed queue metrics for observability
 */
export declare function getQueueMetrics(): QueueMetrics;
/**
 * Called by stores when data changes.
 * Debounces and batches changes before indexing.
 */
export declare function onStoreChange(event: StoreChangeEvent): void;
/**
 * Notify that a habit was created/updated
 */
export declare function onHabitChange(userId: string, habitId: string, habit: {
    name: string;
    description?: string;
    frequency?: string;
    streakCurrent?: number;
}, changeType?: ChangeType): void;
/**
 * Notify that a savings goal was created/updated
 */
export declare function onSavingsGoalChange(userId: string, goalId: string, goal: {
    name: string;
    targetAmount: number;
    currentAmount: number;
    deadline?: string;
    priority?: string;
}, changeType?: ChangeType): void;
/**
 * Notify that a milestone was created/updated
 */
export declare function onMilestoneChange(userId: string, milestoneId: string, milestone: {
    name: string;
    category: string;
    status: string;
    targetDate?: string;
    notes?: string;
}, changeType?: ChangeType): void;
/**
 * Notify that a budget was created/updated
 */
export declare function onBudgetChange(userId: string, budgetId: string, budget: {
    name: string;
    monthlyLimit: number;
    spent: number;
    remaining: number;
}, changeType?: ChangeType): void;
/**
 * Notify that a task was created/updated (only for important tasks)
 */
export declare function onTaskChange(userId: string, taskId: string, task: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
}, changeType?: ChangeType): void;
/**
 * Notify that a subscription was created/updated
 */
export declare function onSubscriptionChange(userId: string, subId: string, sub: {
    name: string;
    amount: number;
    frequency: string;
    category?: string;
    usefulness?: string;
    isActive?: boolean;
}, changeType?: ChangeType): void;
/**
 * Notify that a spending trigger was created/updated
 */
export declare function onSpendingTriggerChange(userId: string, triggerId: string, trigger: {
    trigger: string;
    emotion?: string;
    category?: string;
    frequency?: string;
}, changeType?: ChangeType): void;
/**
 * Notify that a routine was created/updated
 */
export declare function onRoutineChange(userId: string, routineId: string, routine: {
    name: string;
    description?: string;
    timeOfDay?: string;
    steps?: string[];
}, changeType?: ChangeType): void;
/**
 * Notify that a life goal was created/updated
 */
export declare function onLifeGoalChange(userId: string, goalId: string, goal: {
    title: string;
    description?: string;
    category?: string;
    timeframe?: string;
    progress?: number;
}, changeType?: ChangeType): void;
/**
 * Flush all pending changes immediately (e.g., at session end)
 */
export declare function flushPendingChanges(): Promise<{
    flushed: number;
    errors: number;
}>;
/**
 * Clear all pending changes without processing (for cleanup/testing)
 */
export declare function clearPendingChanges(): void;
//# sourceMappingURL=store-hooks.d.ts.map