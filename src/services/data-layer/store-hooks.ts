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

import { embed } from '../memory/embeddings.js';
import { getFirestoreVectorStore } from '../memory/firestore-vector-store/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getIndexingPolicy, shouldIndex, getEntityPolicy } from './indexing-policy.js';
import { trackIndexingError, trackIndexingOperation } from './observability.js';
import type { ChangeType, EntityType, StoreChangeEvent } from './types.js';

const log = createLogger({ module: 'store-hooks' });

// Re-export types for convenience
export type { ChangeType, EntityType, StoreChangeEvent, StoreType } from './types.js';

// ============================================================================
// STATE & METRICS
// ============================================================================

// Debounce indexing to batch rapid changes
const pendingIndexes = new Map<string, StoreChangeEvent>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Metrics tracking
let indexedCount = 0;
let skippedCount = 0;
let errorCount = 0;
let lastFlushTime: Date | undefined;

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
export function getIndexingMetrics(): IndexingMetrics {
  return {
    pendingCount: pendingIndexes.size,
    indexedCount,
    skippedCount,
    errorCount,
    lastFlushTime,
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  indexedCount = 0;
  skippedCount = 0;
  errorCount = 0;
  lastFlushTime = undefined;
}

/**
 * Enforce maxPerUser limits for an entity type
 * Deletes oldest documents if limit is exceeded
 */
async function enforceMaxPerUser(
  vectorStore: ReturnType<typeof getFirestoreVectorStore>,
  userId: string,
  entityType: EntityType
): Promise<void> {
  const policy = getEntityPolicy(entityType);
  const maxPerUser = policy?.conditions?.maxPerUser;

  // No limit configured, skip enforcement
  if (!maxPerUser || maxPerUser <= 0) {
    return;
  }

  try {
    // Query existing documents for this user + entity type
    const existingDocs = await vectorStore.search('', {
      topK: maxPerUser + 10, // Get a bit more than limit to check
      filter: {
        userId,
        metadata: { entityType },
      },
    });

    // If under limit, no action needed
    if (existingDocs.length < maxPerUser) {
      return;
    }

    // Sort by indexedAt (oldest first) and delete excess
    const toDelete = existingDocs
      .sort((a, b) => {
        const aTime = (a.document.metadata?.indexedAt as string) || '';
        const bTime = (b.document.metadata?.indexedAt as string) || '';
        return aTime.localeCompare(bTime);
      })
      .slice(0, existingDocs.length - maxPerUser + 1) // Keep room for the new one
      .map((doc) => doc.document.id);

    // Delete oldest documents
    for (const docId of toDelete) {
      if (docId) {
        await vectorStore.removeDocument(docId);
        log.debug(
          { userId, entityType, docId },
          '🧹 Removed old document to enforce maxPerUser limit'
        );
      }
    }

    if (toDelete.length > 0) {
      log.info(
        { userId, entityType, removed: toDelete.length, limit: maxPerUser },
        '📊 maxPerUser limit enforced'
      );
    }
  } catch (error) {
    // Log but don't fail - this is a best-effort cleanup
    log.debug({ userId, entityType, error: String(error) }, 'maxPerUser enforcement skipped');
  }
}

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
export function getQueueMetrics(): QueueMetrics {
  const totalOps = indexedCount + skippedCount + errorCount;
  const successRate = totalOps > 0 ? ((indexedCount + skippedCount) / totalOps) * 100 : 100;

  // Calculate oldest pending item age
  let oldestPendingAge: number | null = null;
  const pendingByStore: Record<string, number> = {};
  const pendingByEntity: Record<string, number> = {};

  for (const [_key, event] of pendingIndexes.entries()) {
    if (event.timestamp) {
      const age = Date.now() - event.timestamp.getTime();
      if (oldestPendingAge === null || age > oldestPendingAge) {
        oldestPendingAge = age;
      }
    }

    // Count by store
    const storeKey = event.storeType;
    pendingByStore[storeKey] = (pendingByStore[storeKey] || 0) + 1;

    // Count by entity
    const entityKey = event.entityType;
    pendingByEntity[entityKey] = (pendingByEntity[entityKey] || 0) + 1;
  }

  return {
    pendingIndexes: pendingIndexes.size,
    activeTimers: debounceTimers.size,
    successRate,
    totalOperations: totalOps,
    lastFlushTime: lastFlushTime ? lastFlushTime.toISOString() : null,
    oldestPendingAge,
    pendingByStore,
    pendingByEntity,
  };
}

// ============================================================================
// HOOK FUNCTIONS
// ============================================================================

/**
 * Called by stores when data changes.
 * Debounces and batches changes before indexing.
 */
export function onStoreChange(event: StoreChangeEvent): void {
  const policy = getIndexingPolicy();
  const key = `${event.userId}:${event.storeType}:${event.entityType}:${event.entityId}`;

  // Store the latest event (overwrites previous if rapid updates)
  pendingIndexes.set(key, { ...event, timestamp: new Date() });

  // Clear existing timer
  const existingTimer = debounceTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer using policy debounce time
  const timer = setTimeout(() => {
    void processChange(key);
  }, policy.debounceMs);

  debounceTimers.set(key, timer);
}

/**
 * Process a debounced change - index to semantic memory
 */
async function processChange(key: string): Promise<void> {
  const event = pendingIndexes.get(key);
  if (!event) return;

  pendingIndexes.delete(key);
  debounceTimers.delete(key);

  const startTime = Date.now();
  const docId = `${event.storeType}_${event.entityType}_${event.entityId}`;

  try {
    const vectorStore = getFirestoreVectorStore();

    // Handle delete operations - ACTUALLY delete from vector store
    if (event.changeType === 'delete') {
      try {
        await vectorStore.removeDocument(docId);
        const durationMs = Date.now() - startTime;
        trackIndexingOperation(
          event.entityType as EntityType,
          event.userId,
          'delete',
          durationMs,
          true
        );
        log.debug({ key, docId }, '🗑️ Deleted from semantic index');
      } catch (deleteError) {
        // Document may not exist, which is fine
        log.debug({ key, error: String(deleteError) }, 'Delete skipped - document may not exist');
      }
      return;
    }

    // Check indexing policy
    const { shouldIndex: doIndex, reason } = shouldIndex(
      event.entityType as EntityType,
      event.metadata || {}
    );

    if (!doIndex) {
      log.debug({ key, reason }, 'Skipping index - policy check failed');
      skippedCount++;
      return;
    }

    // Enforce maxPerUser limits
    await enforceMaxPerUser(vectorStore, event.userId, event.entityType as EntityType);

    // Generate embedding
    const embedding = await embed(event.content);

    // Index to semantic memory via Firestore vector store
    await vectorStore.addDocument({
      id: docId,
      text: event.content,
      embedding,
      metadata: {
        userId: event.userId,
        storeType: event.storeType,
        entityType: event.entityType,
        entityId: event.entityId,
        source: 'store_auto_sync',
        indexedAt: new Date().toISOString(),
        changeType: event.changeType,
        ...event.metadata,
      },
    });

    const durationMs = Date.now() - startTime;
    indexedCount++;
    trackIndexingOperation(
      event.entityType as EntityType,
      event.userId,
      event.changeType,
      durationMs,
      true
    );
    log.debug({ key, changeType: event.changeType, durationMs }, '🔄 Store change indexed');
  } catch (error) {
    const durationMs = Date.now() - startTime;
    errorCount++;
    trackIndexingError(event.entityType as EntityType, event.userId, String(error));
    trackIndexingOperation(
      event.entityType as EntityType,
      event.userId,
      event.changeType,
      durationMs,
      false
    );
    log.warn({ error: String(error), key }, 'Failed to process store change');
  }
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Notify that a habit was created/updated
 */
export function onHabitChange(
  userId: string,
  habitId: string,
  habit: { name: string; description?: string; frequency?: string; streakCurrent?: number },
  changeType: ChangeType = 'update'
): void {
  onStoreChange({
    storeType: 'productivity',
    changeType,
    userId,
    entityType: 'habit',
    entityId: habitId,
    content: `Habit: ${habit.name}. ${habit.description || ''} Frequency: ${habit.frequency || 'daily'}. ${habit.streakCurrent !== undefined && habit.streakCurrent !== null ? `Current streak: ${habit.streakCurrent} days.` : ''}`,
    metadata: { frequency: habit.frequency },
  });
}

/**
 * Notify that a savings goal was created/updated
 */
export function onSavingsGoalChange(
  userId: string,
  goalId: string,
  goal: {
    name: string;
    targetAmount: number;
    currentAmount: number;
    deadline?: string;
    priority?: string;
  },
  changeType: ChangeType = 'update'
): void {
  onStoreChange({
    storeType: 'financial',
    changeType,
    userId,
    entityType: 'savings_goal',
    entityId: goalId,
    content: `Savings goal: ${goal.name}. Target: $${goal.targetAmount}. Current: $${goal.currentAmount}. ${goal.deadline ? `Deadline: ${goal.deadline}` : ''}`,
    metadata: { priority: goal.priority },
  });
}

/**
 * Notify that a milestone was created/updated
 */
export function onMilestoneChange(
  userId: string,
  milestoneId: string,
  milestone: {
    name: string;
    category: string;
    status: string;
    targetDate?: string;
    notes?: string;
  },
  changeType: ChangeType = 'update'
): void {
  onStoreChange({
    storeType: 'life-data',
    changeType,
    userId,
    entityType: 'milestone',
    entityId: milestoneId,
    content: `Life milestone: ${milestone.name} (${milestone.category}). Status: ${milestone.status}. ${milestone.targetDate ? `Target date: ${milestone.targetDate}` : ''} ${milestone.notes || ''}`,
    metadata: { category: milestone.category, status: milestone.status },
  });
}

/**
 * Notify that a budget was created/updated
 */
export function onBudgetChange(
  userId: string,
  budgetId: string,
  budget: { name: string; monthlyLimit: number; spent: number; remaining: number },
  changeType: ChangeType = 'update'
): void {
  onStoreChange({
    storeType: 'financial',
    changeType,
    userId,
    entityType: 'budget',
    entityId: budgetId,
    content: `Budget: ${budget.name}. Monthly limit: $${budget.monthlyLimit}. Spent: $${budget.spent}. Remaining: $${budget.remaining}.`,
  });
}

/**
 * Notify that a task was created/updated (only for important tasks)
 */
export function onTaskChange(
  userId: string,
  taskId: string,
  task: { title: string; description?: string; priority?: string; dueDate?: string },
  changeType: ChangeType = 'update'
): void {
  // Only index high priority tasks
  if (task.priority !== 'high' && task.priority !== 'urgent') {
    return;
  }

  onStoreChange({
    storeType: 'productivity',
    changeType,
    userId,
    entityType: 'task',
    entityId: taskId,
    content: `Task (${task.priority}): ${task.title}. ${task.description || ''} ${task.dueDate ? `Due: ${task.dueDate}` : ''}`,
    metadata: { priority: task.priority },
  });
}

/**
 * Notify that a subscription was created/updated
 */
export function onSubscriptionChange(
  userId: string,
  subId: string,
  sub: {
    name: string;
    amount: number;
    frequency: string;
    category?: string;
    usefulness?: string;
    isActive?: boolean;
  },
  changeType: ChangeType = 'update'
): void {
  // Only index active subscriptions
  if (sub.isActive === false) {
    return;
  }

  onStoreChange({
    storeType: 'financial',
    changeType,
    userId,
    entityType: 'subscription',
    entityId: subId,
    content: `Subscription: ${sub.name}. $${sub.amount}/${sub.frequency}. ${sub.category ? `Category: ${sub.category}.` : ''} ${sub.usefulness ? `Value: ${sub.usefulness}.` : ''}`,
    metadata: { category: sub.category, amount: sub.amount, isActive: sub.isActive },
  });
}

/**
 * Notify that a spending trigger was created/updated
 */
export function onSpendingTriggerChange(
  userId: string,
  triggerId: string,
  trigger: {
    trigger: string;
    emotion?: string;
    category?: string;
    frequency?: string;
  },
  changeType: ChangeType = 'update'
): void {
  onStoreChange({
    storeType: 'financial',
    changeType,
    userId,
    entityType: 'spending_trigger',
    entityId: triggerId,
    content: `Spending trigger: ${trigger.trigger}. ${trigger.emotion ? `Emotion: ${trigger.emotion}.` : ''} ${trigger.category ? `Category: ${trigger.category}.` : ''} ${trigger.frequency ? `Frequency: ${trigger.frequency}.` : ''}`,
    metadata: { emotion: trigger.emotion, category: trigger.category },
  });
}

/**
 * Notify that a routine was created/updated
 */
export function onRoutineChange(
  userId: string,
  routineId: string,
  routine: {
    name: string;
    description?: string;
    timeOfDay?: string;
    steps?: string[];
  },
  changeType: ChangeType = 'update'
): void {
  onStoreChange({
    storeType: 'productivity',
    changeType,
    userId,
    entityType: 'routine',
    entityId: routineId,
    content: `Routine: ${routine.name}. ${routine.description || ''} ${routine.timeOfDay ? `Time: ${routine.timeOfDay}.` : ''} ${routine.steps ? `Steps: ${routine.steps.join(', ')}.` : ''}`,
    metadata: { timeOfDay: routine.timeOfDay },
  });
}

/**
 * Notify that a life goal was created/updated
 */
export function onLifeGoalChange(
  userId: string,
  goalId: string,
  goal: {
    title: string;
    description?: string;
    category?: string;
    timeframe?: string;
    progress?: number;
  },
  changeType: ChangeType = 'update'
): void {
  onStoreChange({
    storeType: 'life-data',
    changeType,
    userId,
    entityType: 'life_goal',
    entityId: goalId,
    content: `Life goal: ${goal.title}. ${goal.description || ''} ${goal.category ? `Category: ${goal.category}.` : ''} ${goal.timeframe ? `Timeframe: ${goal.timeframe}.` : ''} ${goal.progress !== undefined && goal.progress !== null ? `Progress: ${goal.progress}%.` : ''}`,
    metadata: { category: goal.category, progress: goal.progress },
  });
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Flush all pending changes immediately (e.g., at session end)
 */
export async function flushPendingChanges(): Promise<{ flushed: number; errors: number }> {
  const keys = Array.from(pendingIndexes.keys());
  const errorsBefore = errorCount;

  // Clear all timers
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();

  // Process all pending
  await Promise.all(keys.map(async (key) => processChange(key)));

  lastFlushTime = new Date();
  const errorsInFlush = errorCount - errorsBefore;

  log.info({ flushed: keys.length, errors: errorsInFlush }, '🔄 Flushed pending store changes');

  return { flushed: keys.length, errors: errorsInFlush };
}

/**
 * Clear all pending changes without processing (for cleanup/testing)
 */
export function clearPendingChanges(): void {
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
  pendingIndexes.clear();
}
