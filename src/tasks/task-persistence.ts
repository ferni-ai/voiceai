/**
 * Task Persistence Layer
 *
 * Provides Firestore-backed persistence for task results and history.
 * Enables:
 * - Task result storage for analytics
 * - Historical task completion tracking
 * - Cross-session task state recovery
 * - Task effectiveness analysis
 *
 * @module TaskPersistence
 */

import { createLogger } from '../utils/safe-logger.js';
import { removeUndefined } from '../utils/firestore-utils.js';

const log = createLogger({ module: 'TaskPersistence' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Record of a completed task
 */
export interface TaskRecord {
  /** Unique task execution ID */
  id: string;
  /** Type/name of the task */
  taskType: string;
  /** User who the task was executed for */
  userId: string;
  /** Persona that executed the task (if applicable) */
  personaId?: string;
  /** When the task started */
  startedAt: Date;
  /** When the task completed */
  completedAt?: Date;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Number of conversation turns */
  turnsToComplete: number;
  /** Initial user distress level (0-1) */
  initialDistress: number;
  /** Final user distress level (0-1) */
  finalDistress: number;
  /** Distress improvement (positive = improvement) */
  distressImprovement: number;
  /** Whether the task achieved its goal */
  wasEffective: boolean;
  /** Task category */
  category: 'micro' | 'support' | 'advice' | 'relationship' | 'life_event';
  /** Task priority (1-10) */
  priority: number;
  /** How the task was triggered */
  triggerType: 'automatic' | 'manual' | 'scheduled';
  /** What triggered the task */
  triggerReason?: string;
  /** Result data from the task */
  result?: unknown;
  /** Any error that occurred */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Summary of task history for a user
 */
export interface UserTaskSummary {
  userId: string;
  totalTasks: number;
  tasksByCategory: Record<string, number>;
  tasksByType: Record<string, number>;
  averageDistressImprovement: number;
  averageTurnsToComplete: number;
  effectivenessRate: number;
  mostFrequentTasks: Array<{ taskType: string; count: number }>;
  lastTaskAt?: Date;
}

/**
 * Options for querying task history
 */
export interface TaskHistoryQuery {
  userId?: string;
  taskType?: string;
  category?: string;
  startDate?: Date;
  endDate?: Date;
  wasEffective?: boolean;
  limit?: number;
  orderBy?: 'startedAt' | 'completedAt' | 'distressImprovement';
  orderDirection?: 'asc' | 'desc';
}

// ============================================================================
// IN-MEMORY CACHE & DEDUPLICATION
// ============================================================================

// In-memory cache for recent task records (for performance)
const recentTaskCache = new Map<string, TaskRecord>();
const MAX_CACHE_SIZE = 1000;

// Deduplication tracking: key = userId:taskType, value = { timestamp, hash }
interface DedupeEntry {
  timestamp: number;
  contentHash: string;
}
const dedupeIndex = new Map<string, DedupeEntry>();
const DEDUPE_WINDOW_MS = 60 * 1000; // 1 minute deduplication window
const MAX_DEDUPE_ENTRIES = 500;

/**
 * Generate a content hash for deduplication
 * Uses key fields that define task uniqueness
 */
function generateTaskContentHash(record: TaskRecord): string {
  // Hash based on the fields that would indicate a duplicate
  const hashInput = [
    record.taskType,
    record.userId,
    record.category,
    Math.round(record.initialDistress * 10),
    Math.round(record.finalDistress * 10),
    record.turnsToComplete,
    record.triggerReason || '',
  ].join(':');

  // Simple hash (not cryptographic, just for deduplication)
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Check if this task is a duplicate (same user, type, and content within time window)
 */
function isDuplicateTask(record: TaskRecord): boolean {
  const dedupeKey = `${record.userId}:${record.taskType}`;
  const contentHash = generateTaskContentHash(record);
  const existing = dedupeIndex.get(dedupeKey);

  if (existing) {
    const age = Date.now() - existing.timestamp;
    // Duplicate if same content within time window
    if (age < DEDUPE_WINDOW_MS && existing.contentHash === contentHash) {
      log.debug(
        {
          userId: record.userId,
          taskType: record.taskType,
          ageMs: age,
        },
        'Skipping duplicate task record'
      );
      return true;
    }
  }

  return false;
}

/**
 * Mark a task as recorded for deduplication
 */
function markTaskRecorded(record: TaskRecord): void {
  const dedupeKey = `${record.userId}:${record.taskType}`;
  const contentHash = generateTaskContentHash(record);

  dedupeIndex.set(dedupeKey, {
    timestamp: Date.now(),
    contentHash,
  });

  // Clean up old entries if over limit
  if (dedupeIndex.size > MAX_DEDUPE_ENTRIES) {
    const now = Date.now();
    const cutoff = now - DEDUPE_WINDOW_MS * 2;

    for (const [key, entry] of dedupeIndex.entries()) {
      if (entry.timestamp < cutoff) {
        dedupeIndex.delete(key);
      }
    }

    // If still over limit, remove oldest
    if (dedupeIndex.size > MAX_DEDUPE_ENTRIES) {
      const entries = Array.from(dedupeIndex.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      const toRemove = entries.slice(0, entries.length - MAX_DEDUPE_ENTRIES);
      for (const [key] of toRemove) {
        dedupeIndex.delete(key);
      }
    }
  }
}

function addToCache(record: TaskRecord): void {
  recentTaskCache.set(record.id, record);

  // Evict oldest if over limit
  if (recentTaskCache.size > MAX_CACHE_SIZE) {
    const firstKey = recentTaskCache.keys().next().value;
    if (firstKey) {
      recentTaskCache.delete(firstKey);
    }
  }
}

/**
 * Get deduplication stats for monitoring
 */
export function getDedupeStats(): { entries: number; maxEntries: number; windowMs: number } {
  return {
    entries: dedupeIndex.size,
    maxEntries: MAX_DEDUPE_ENTRIES,
    windowMs: DEDUPE_WINDOW_MS,
  };
}

// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================

const COLLECTION_NAME = 'task_history';
const SUMMARIES_COLLECTION = 'task_summaries';

/**
 * Save a task record to Firestore
 * Returns empty string if record is a duplicate (deduped)
 */
export async function saveTaskRecord(record: TaskRecord): Promise<string> {
  // Check for duplicates before saving
  if (isDuplicateTask(record)) {
    return ''; // Return empty string to indicate deduplication
  }

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    // Generate ID if not provided
    const docId = record.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const recordWithId = { ...record, id: docId };

    // Save to Firestore
    await db
      .collection(COLLECTION_NAME)
      .doc(docId)
      .set(
        removeUndefined({
          ...recordWithId,
          startedAt: record.startedAt.toISOString(),
          completedAt: record.completedAt?.toISOString(),
          createdAt: new Date().toISOString(),
        })
      );

    // Add to cache
    addToCache(recordWithId);

    // Mark as recorded for deduplication
    markTaskRecorded(recordWithId);

    log.debug({ taskId: docId, taskType: record.taskType }, 'Saved task record');

    // Update user summary asynchronously
    updateUserSummaryAsync(record.userId).catch((err) => {
      log.warn({ error: err, userId: record.userId }, 'Failed to update user task summary');
    });

    return docId;
  } catch (error) {
    log.error({ error, taskType: record.taskType }, 'Failed to save task record');
    throw error;
  }
}

/**
 * Get task history with optional filters
 */
export async function getTaskHistory(query: TaskHistoryQuery = {}): Promise<TaskRecord[]> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    let firestoreQuery = db.collection(COLLECTION_NAME) as FirebaseFirestore.Query;

    // Apply filters
    if (query.userId) {
      firestoreQuery = firestoreQuery.where('userId', '==', query.userId);
    }
    if (query.taskType) {
      firestoreQuery = firestoreQuery.where('taskType', '==', query.taskType);
    }
    if (query.category) {
      firestoreQuery = firestoreQuery.where('category', '==', query.category);
    }
    if (query.wasEffective !== undefined) {
      firestoreQuery = firestoreQuery.where('wasEffective', '==', query.wasEffective);
    }
    if (query.startDate) {
      firestoreQuery = firestoreQuery.where('startedAt', '>=', query.startDate.toISOString());
    }
    if (query.endDate) {
      firestoreQuery = firestoreQuery.where('startedAt', '<=', query.endDate.toISOString());
    }

    // Apply ordering
    const orderField = query.orderBy || 'startedAt';
    const orderDir = query.orderDirection || 'desc';
    firestoreQuery = firestoreQuery.orderBy(orderField, orderDir);

    // Apply limit
    const limit = query.limit || 100;
    firestoreQuery = firestoreQuery.limit(limit);

    const snapshot = await firestoreQuery.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        startedAt: new Date(data.startedAt),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      } as TaskRecord;
    });
  } catch (error) {
    log.error({ error, query }, 'Failed to get task history');
    return [];
  }
}

/**
 * Get task records for a specific user
 */
export async function getUserTaskHistory(userId: string, limit = 50): Promise<TaskRecord[]> {
  return getTaskHistory({ userId, limit });
}

/**
 * Get recent tasks of a specific type
 */
export async function getRecentTasksByType(taskType: string, limit = 20): Promise<TaskRecord[]> {
  return getTaskHistory({ taskType, limit });
}

/**
 * Get task summary for a user
 */
export async function getUserTaskSummary(userId: string): Promise<UserTaskSummary | null> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    const doc = await db.collection(SUMMARIES_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      // Generate summary if it doesn't exist
      return generateUserSummary(userId);
    }

    const data = doc.data();
    return {
      ...data,
      lastTaskAt: data?.lastTaskAt ? new Date(data.lastTaskAt) : undefined,
    } as UserTaskSummary;
  } catch (error) {
    log.warn({ error, userId }, 'Failed to get user task summary');
    return null;
  }
}

/**
 * Generate and save a user summary from their task history
 */
async function generateUserSummary(userId: string): Promise<UserTaskSummary> {
  const tasks = await getTaskHistory({ userId, limit: 500 });

  if (tasks.length === 0) {
    return {
      userId,
      totalTasks: 0,
      tasksByCategory: {},
      tasksByType: {},
      averageDistressImprovement: 0,
      averageTurnsToComplete: 0,
      effectivenessRate: 0,
      mostFrequentTasks: [],
    };
  }

  const tasksByCategory: Record<string, number> = {};
  const tasksByType: Record<string, number> = {};
  let totalDistressImprovement = 0;
  let totalTurns = 0;
  let effectiveCount = 0;

  for (const task of tasks) {
    // Count by category
    tasksByCategory[task.category] = (tasksByCategory[task.category] || 0) + 1;

    // Count by type
    tasksByType[task.taskType] = (tasksByType[task.taskType] || 0) + 1;

    // Sum metrics
    totalDistressImprovement += task.distressImprovement;
    totalTurns += task.turnsToComplete;
    if (task.wasEffective) effectiveCount++;
  }

  // Calculate most frequent tasks
  const sortedTypes = Object.entries(tasksByType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([taskType, count]) => ({ taskType, count }));

  const summary: UserTaskSummary = {
    userId,
    totalTasks: tasks.length,
    tasksByCategory,
    tasksByType,
    averageDistressImprovement: totalDistressImprovement / tasks.length,
    averageTurnsToComplete: totalTurns / tasks.length,
    effectivenessRate: effectiveCount / tasks.length,
    mostFrequentTasks: sortedTypes,
    lastTaskAt: tasks[0]?.startedAt,
  };

  // Save the summary
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();

    await db
      .collection(SUMMARIES_COLLECTION)
      .doc(userId)
      .set(
        removeUndefined({
          ...summary,
          lastTaskAt: summary.lastTaskAt?.toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
  } catch (error) {
    log.warn({ error, userId }, 'Failed to save user task summary');
  }

  return summary;
}

/**
 * Update user summary asynchronously
 */
async function updateUserSummaryAsync(userId: string): Promise<void> {
  await generateUserSummary(userId);
}

// ============================================================================
// TASK MANAGER INTEGRATION
// ============================================================================

/**
 * Create a task record from TaskManager active task data
 */
export function createTaskRecordFromActiveTask(
  taskId: string,
  taskName: string,
  category: 'micro' | 'support' | 'advice' | 'relationship' | 'life_event',
  priority: number,
  userId: string,
  initialDistress: number,
  finalDistress: number,
  turnsToComplete: number,
  options?: {
    personaId?: string;
    triggerType?: 'automatic' | 'manual' | 'scheduled';
    triggerReason?: string;
    result?: unknown;
    error?: string;
  }
): TaskRecord {
  const startedAt = new Date(Date.now() - turnsToComplete * 5000); // Estimate start time
  const completedAt = new Date();
  const distressImprovement = initialDistress - finalDistress;

  return {
    id: `${taskId}_${Date.now()}`,
    taskType: taskId,
    userId,
    personaId: options?.personaId,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    turnsToComplete,
    initialDistress,
    finalDistress,
    distressImprovement,
    wasEffective: distressImprovement > 0.1,
    category,
    priority,
    triggerType: options?.triggerType || 'automatic',
    triggerReason: options?.triggerReason,
    result: options?.result,
    error: options?.error,
  };
}

// ============================================================================
// ANALYTICS HELPERS
// ============================================================================

/**
 * Get task effectiveness statistics
 */
export async function getTaskEffectivenessStats(
  options: {
    taskType?: string;
    category?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{
  totalTasks: number;
  effectiveCount: number;
  effectivenessRate: number;
  averageDistressImprovement: number;
  averageTurnsToComplete: number;
}> {
  const tasks = await getTaskHistory({
    taskType: options.taskType,
    category: options.category,
    startDate: options.startDate,
    endDate: options.endDate,
    limit: 1000,
  });

  if (tasks.length === 0) {
    return {
      totalTasks: 0,
      effectiveCount: 0,
      effectivenessRate: 0,
      averageDistressImprovement: 0,
      averageTurnsToComplete: 0,
    };
  }

  const effectiveCount = tasks.filter((t) => t.wasEffective).length;
  const totalDistressImprovement = tasks.reduce((sum, t) => sum + t.distressImprovement, 0);
  const totalTurns = tasks.reduce((sum, t) => sum + t.turnsToComplete, 0);

  return {
    totalTasks: tasks.length,
    effectiveCount,
    effectivenessRate: effectiveCount / tasks.length,
    averageDistressImprovement: totalDistressImprovement / tasks.length,
    averageTurnsToComplete: totalTurns / tasks.length,
  };
}

/**
 * Get underperforming tasks (for improvement focus)
 */
export async function getUnderperformingTasks(
  effectivenessThreshold = 0.5
): Promise<Array<{ taskType: string; effectivenessRate: number; count: number }>> {
  const tasks = await getTaskHistory({ limit: 1000 });

  // Group by task type
  const taskTypeStats = new Map<string, { effective: number; total: number }>();

  for (const task of tasks) {
    const stats = taskTypeStats.get(task.taskType) || { effective: 0, total: 0 };
    stats.total++;
    if (task.wasEffective) stats.effective++;
    taskTypeStats.set(task.taskType, stats);
  }

  // Filter to underperforming
  const underperforming: Array<{ taskType: string; effectivenessRate: number; count: number }> = [];

  for (const [taskType, stats] of taskTypeStats) {
    const rate = stats.effective / stats.total;
    if (rate < effectivenessThreshold && stats.total >= 5) {
      underperforming.push({
        taskType,
        effectivenessRate: rate,
        count: stats.total,
      });
    }
  }

  return underperforming.sort((a, b) => a.effectivenessRate - b.effectivenessRate);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const taskPersistence = {
  saveTaskRecord,
  getTaskHistory,
  getUserTaskHistory,
  getRecentTasksByType,
  getUserTaskSummary,
  createTaskRecordFromActiveTask,
  getTaskEffectivenessStats,
  getUnderperformingTasks,
  getDedupeStats,
};

export default taskPersistence;
