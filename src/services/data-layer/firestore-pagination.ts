/**
 * Firestore Pagination Utilities
 *
 * Provides safe, paginated access to Firestore collections to prevent
 * loading unbounded amounts of data. Never use .get() on a collection
 * without a limit!
 *
 * @module services/data-layer/firestore-pagination
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'FirestorePagination' });

// ============================================================================
// TYPES
// ============================================================================

export interface PaginationOptions {
  /** Maximum items per page (default: 50) */
  pageSize?: number;
  /** Field to order by (default: 'createdAt') */
  orderBy?: string;
  /** Order direction (default: 'desc') */
  orderDirection?: 'asc' | 'desc';
  /** Cursor for pagination (from previous page) */
  startAfter?: unknown;
  /** Filter field */
  whereField?: string;
  /** Filter operator */
  whereOp?: FirebaseFirestore.WhereFilterOp;
  /** Filter value */
  whereValue?: unknown;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: unknown | null;
  totalFetched: number;
}

export interface SafeQueryOptions {
  /** Maximum total items to fetch (default: 100) */
  maxItems?: number;
  /** Fields to select (if supported) */
  select?: string[];
  /** Date field to filter by recency */
  dateField?: string;
  /** Only fetch items newer than this many days */
  recentDays?: number;
}

// ============================================================================
// DEFAULT LIMITS
// ============================================================================

/**
 * Safe default limits for different entity types
 */
export const SAFE_LIMITS = {
  // User data
  habits: 50,
  tasks: 100,
  bills: 30,
  medications: 20,
  routines: 30,
  notes: 50,
  journalEntries: 30,

  // Financial
  savingsGoals: 30,
  budgets: 20,
  spendingTriggers: 50,

  // Social
  contacts: 200,
  people: 100,
  mentions: 500,

  // Calendar
  events: 100,
  meetings: 50,

  // Other
  commitments: 50,
  dreams: 30,
  milestones: 30,
  insights: 100,

  // Logs/History (time-bounded)
  habitLogs: 200, // Last 30 days only
  doseLogs: 100, // Last 7 days only
  gameHistory: 50,

  // Admin/System
  users: 1000,
  waitlist: 500,
} as const;

// ============================================================================
// PAGINATION FUNCTIONS
// ============================================================================

/**
 * Safely query a Firestore collection with pagination
 */
export async function paginatedQuery<T>(
  collectionRef: FirebaseFirestore.CollectionReference,
  options: PaginationOptions = {}
): Promise<PaginatedResult<T>> {
  const pageSize = options.pageSize ?? 50;
  const orderBy = options.orderBy ?? 'createdAt';
  const orderDirection = options.orderDirection ?? 'desc';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = collectionRef.orderBy(orderBy, orderDirection).limit(pageSize + 1);

  // Apply filter if provided
  if (options.whereField && options.whereOp && options.whereValue !== undefined) {
    query = query.where(options.whereField, options.whereOp, options.whereValue);
  }

  // Apply cursor for pagination
  if (options.startAfter) {
    query = query.startAfter(options.startAfter);
  }

  const snapshot = await query.get();
  const docs = snapshot.docs;

  // Check if there are more results
  const hasMore = docs.length > pageSize;
  const items = docs.slice(0, pageSize).map((doc: FirebaseFirestore.DocumentSnapshot) => ({
    id: doc.id,
    ...doc.data(),
  })) as T[];

  // Get cursor for next page
  const nextCursor = hasMore && docs.length > 0 ? docs[pageSize - 1] : null;

  return {
    items,
    hasMore,
    nextCursor,
    totalFetched: items.length,
  };
}

/**
 * Safely fetch all items up to a limit (auto-paginating)
 */
export async function safeQueryAll<T>(
  collectionRef: FirebaseFirestore.CollectionReference,
  options: SafeQueryOptions = {}
): Promise<T[]> {
  const maxItems = options.maxItems ?? 100;
  const pageSize = Math.min(50, maxItems);

  const allItems: T[] = [];
  let cursor: unknown = null;
  let iterations = 0;
  const maxIterations = Math.ceil(maxItems / pageSize) + 1;

  while (allItems.length < maxItems && iterations < maxIterations) {
    const paginationOptions: PaginationOptions = {
      pageSize,
      startAfter: cursor,
    };

    // Apply date filter if specified
    if (options.dateField && options.recentDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - options.recentDays);
      paginationOptions.whereField = options.dateField;
      paginationOptions.whereOp = '>=';
      paginationOptions.whereValue = cutoffDate;
    }

    const result = await paginatedQuery<T>(collectionRef, paginationOptions);

    allItems.push(...result.items);
    cursor = result.nextCursor;
    iterations++;

    if (!result.hasMore || !cursor) break;
  }

  // Trim to maxItems
  return allItems.slice(0, maxItems);
}

/**
 * Count documents in a collection (with limit for safety)
 */
export async function safeCount(
  collectionRef: FirebaseFirestore.CollectionReference,
  maxToCount = 10000
): Promise<{ count: number; isTruncated: boolean }> {
  try {
    // Try native count if available
    const countSnapshot = await collectionRef.count().get();
    const count = countSnapshot.data().count;
    return { count, isTruncated: false };
  } catch {
    // Fallback to manual counting with limit
    const snapshot = await collectionRef.limit(maxToCount).select().get();
    return {
      count: snapshot.size,
      isTruncated: snapshot.size === maxToCount,
    };
  }
}

// ============================================================================
// SAFE QUERY BUILDERS
// ============================================================================

/**
 * Build a safe query for recent items only
 */
export function recentItemsQuery(
  collectionRef: FirebaseFirestore.CollectionReference,
  dateField: string,
  days: number,
  limit: number
): FirebaseFirestore.Query {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return collectionRef.where(dateField, '>=', cutoffDate).orderBy(dateField, 'desc').limit(limit);
}

/**
 * Build a safe query for active items only
 */
export function activeItemsQuery(
  collectionRef: FirebaseFirestore.CollectionReference,
  statusField: string,
  activeValues: string[],
  limit: number
): FirebaseFirestore.Query {
  // Note: 'in' queries are limited to 10 values in Firestore
  const safeValues = activeValues.slice(0, 10);
  return collectionRef.where(statusField, 'in', safeValues).limit(limit);
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Replace unsafe .get() calls with paginated versions
 * Use this pattern to migrate existing code:
 *
 * BEFORE (unsafe):
 *   const snapshot = await collection.get();
 *   const items = snapshot.docs.map(d => d.data());
 *
 * AFTER (safe):
 *   const items = await safeQueryAll(collection, { maxItems: 100 });
 */

/**
 * Helper to audit a codebase for unsafe collection queries
 * Returns patterns that should be refactored
 */
export function getUnsafePatterns(): string[] {
  return [
    '.collection(...).get() - Add .limit() or use safeQueryAll()',
    '.where(...).get() - Add .limit() to where queries',
    'snapshot.docs.map - Check if parent query has .limit()',
  ];
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Batch delete with pagination (for cleanup jobs)
 */
export async function batchDelete(
  collectionRef: FirebaseFirestore.CollectionReference,
  query: FirebaseFirestore.Query,
  batchSize = 500
): Promise<{ deleted: number; batches: number }> {
  let deleted = 0;
  let batches = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = await query.limit(batchSize).get();

    if (snapshot.empty) break;

    const batch = collectionRef.firestore.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    deleted += snapshot.size;
    batches++;

    log.debug({ deleted, batches }, 'Batch delete progress');

    // Small delay to avoid overwhelming Firestore
    await new Promise((r) => setTimeout(r, 100));
  }

  return { deleted, batches };
}

/**
 * Batch update with pagination
 */
export async function batchUpdate<T extends Record<string, unknown>>(
  collectionRef: FirebaseFirestore.CollectionReference,
  query: FirebaseFirestore.Query,
  updateFn: (data: T) => Partial<T>,
  batchSize = 500
): Promise<{ updated: number; batches: number }> {
  let updated = 0;
  let batches = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = await query.limit(batchSize).get();

    if (snapshot.empty) break;

    const batch = collectionRef.firestore.batch();
    snapshot.docs.forEach((doc) => {
      const data = doc.data() as T;
      const updates = updateFn(data);
      // Cast to FirebaseFirestore.UpdateData - Partial<T> is compatible at runtime
      batch.update(doc.ref, updates as FirebaseFirestore.UpdateData<T>);
    });
    await batch.commit();

    updated += snapshot.size;
    batches++;

    log.debug({ updated, batches }, 'Batch update progress');

    await new Promise((r) => setTimeout(r, 100));
  }

  return { updated, batches };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  paginatedQuery,
  safeQueryAll,
  safeCount,
  recentItemsQuery,
  activeItemsQuery,
  batchDelete,
  batchUpdate,
  SAFE_LIMITS,
};
