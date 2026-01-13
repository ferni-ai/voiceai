/**
 * Background Task Utility
 *
 * Provides a clean way to run fire-and-forget async operations
 * with proper error logging. Prevents silent failures that are
 * hard to debug.
 *
 * Usage:
 *   import { runBackground } from '../utils/background-task.js';
 *
 *   // Instead of:
 *   someAsyncOp().catch(() => {});
 *
 *   // Use:
 *   runBackground(someAsyncOp(), { task: 'someAsyncOp', userId });
 *
 * @module utils/background-task
 */
import { getLogger } from './safe-logger.js';
/**
 * Run a promise in the background with error logging.
 *
 * This is the recommended way to run fire-and-forget async operations.
 * Errors are logged but don't crash the application.
 *
 * @param promise - The promise to run in the background
 * @param context - Context for logging (must include 'task' name)
 *
 * @example
 * ```typescript
 * // Simple usage
 * runBackground(
 *   sendNotification(userId),
 *   { task: 'sendNotification', userId }
 * );
 *
 * // With additional context
 * runBackground(
 *   persistSession(session),
 *   { task: 'persistSession', sessionId: session.id, turnCount: session.turns }
 * );
 * ```
 */
export function runBackground(promise, context) {
    promise.catch((err) => {
        getLogger().warn({ ...context, err: String(err) }, `Background task failed: ${context.task}`);
    });
}
/**
 * Run a promise with a timeout in the background.
 *
 * If the promise doesn't resolve within the timeout, it's logged
 * as a warning but continues running (won't cancel).
 *
 * @param promise - The promise to run
 * @param timeoutMs - Timeout in milliseconds
 * @param context - Context for logging
 *
 * @example
 * ```typescript
 * runBackgroundWithTimeout(
 *   fetchExternalData(),
 *   5000,
 *   { task: 'fetchExternalData', source: 'api' }
 * );
 * ```
 */
export function runBackgroundWithTimeout(promise, timeoutMs, context) {
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        getLogger().warn({ ...context, timeoutMs }, `Background task timed out: ${context.task}`);
    }, timeoutMs);
    promise
        .then(() => {
        clearTimeout(timeout);
        if (timedOut) {
            getLogger().debug({ ...context, timeoutMs }, `Background task completed after timeout: ${context.task}`);
        }
    })
        .catch((err) => {
        clearTimeout(timeout);
        getLogger().warn({ ...context, err: String(err) }, `Background task failed: ${context.task}`);
    });
}
/**
 * Batch multiple background tasks with a single logging context.
 *
 * @param promises - Array of promises to run
 * @param context - Shared context for all tasks
 *
 * @example
 * ```typescript
 * runBackgroundBatch(
 *   [
 *     notifyEmail(user),
 *     notifyPush(user),
 *     updateAnalytics(user),
 *   ],
 *   { task: 'userNotifications', userId: user.id }
 * );
 * ```
 */
export function runBackgroundBatch(promises, context) {
    void Promise.allSettled(promises).then((results) => {
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
            getLogger().warn({
                ...context,
                total: promises.length,
                failed: failures.length,
                errors: failures.map((f) => (f.status === 'rejected' ? String(f.reason) : '')),
            }, `Background batch partially failed: ${context.task}`);
        }
    });
}
//# sourceMappingURL=background-task.js.map