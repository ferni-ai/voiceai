/**
 * Firestore Vector Store Recovery
 *
 * Handles automatic recovery when Firestore becomes unavailable,
 * including periodic recovery attempts and cache migration.
 *
 * @module memory/firestore-vector-store/recovery
 */
import { getLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { RECOVERY_INTERVAL_MS, MAX_RECOVERY_ATTEMPTS, FIRESTORE_BATCH_SIZE } from './types.js';
const log = getLogger();
const RECOVERY_INTERVAL_NAME = 'firestore-vector-store-recovery';
/**
 * Manages recovery attempts and cache migration.
 */
export class RecoveryManager {
    state = {
        recoveryAttemptCount: 0,
        lastRecoveryAttempt: 0,
    };
    callbacks;
    constructor(callbacks) {
        this.callbacks = callbacks;
    }
    /**
     * Get current recovery state.
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Schedule periodic recovery attempts.
     */
    scheduleRecoveryAttempt() {
        if (hasInterval(RECOVERY_INTERVAL_NAME) || this.state.recoveryAttemptCount >= MAX_RECOVERY_ATTEMPTS) {
            return;
        }
        registerInterval(RECOVERY_INTERVAL_NAME, () => {
            this.attemptRecovery().catch((error) => {
                log.error({ error: String(error) }, 'Unhandled error in recovery attempt');
                this.cleanupTimer();
            });
        }, RECOVERY_INTERVAL_MS);
    }
    /**
     * Attempt to recover Firestore connection.
     */
    async attemptRecovery() {
        if (!this.callbacks.isInFallbackMode()) {
            this.cleanupTimer();
            return true;
        }
        this.state.recoveryAttemptCount++;
        this.state.lastRecoveryAttempt = Date.now();
        log.info({
            attempt: this.state.recoveryAttemptCount,
            maxAttempts: MAX_RECOVERY_ATTEMPTS,
        }, '🔄 Attempting Firestore vector store recovery...');
        try {
            const success = await this.callbacks.reinitialize();
            if (success) {
                log.info({ attempt: this.state.recoveryAttemptCount }, '✅ Firestore vector store recovered successfully!');
                this.callbacks.onRecoverySuccess();
                this.cleanupTimer();
                return true;
            }
        }
        catch (error) {
            log.warn({ error: String(error), attempt: this.state.recoveryAttemptCount }, 'Recovery attempt failed');
        }
        if (this.state.recoveryAttemptCount >= MAX_RECOVERY_ATTEMPTS) {
            log.error({
                attempts: this.state.recoveryAttemptCount,
                risk: 'DATA_LOSS_ON_RESTART',
            }, '❌ Max recovery attempts reached. Vector store stuck in fallback mode. MANUAL INTERVENTION REQUIRED!');
            this.cleanupTimer();
        }
        return false;
    }
    /**
     * Clean up recovery timer.
     */
    cleanupTimer() {
        clearNamedInterval(RECOVERY_INTERVAL_NAME);
    }
    /**
     * Reset recovery state.
     */
    reset() {
        this.cleanupTimer();
        this.state.recoveryAttemptCount = 0;
        this.state.lastRecoveryAttempt = 0;
    }
}
/**
 * Migrate cached data to Firestore after recovery.
 * Uses batch writes to respect Firestore's 500-operation limit.
 */
export async function migrateCacheToFirestore(db, collectionName, fallbackCache) {
    if (fallbackCache.size === 0) {
        return { migrated: 0, failed: 0 };
    }
    log.info({ count: fallbackCache.size }, '📤 Migrating cached vectors to Firestore...');
    const { FieldValue } = await import('@google-cloud/firestore');
    const entries = Array.from(fallbackCache.entries());
    let migrated = 0;
    let failed = 0;
    // Process in batches of 500 (Firestore's limit)
    for (let i = 0; i < entries.length; i += FIRESTORE_BATCH_SIZE) {
        const chunk = entries.slice(i, i + FIRESTORE_BATCH_SIZE);
        // Use individual writes (batch API may not be available)
        for (const [id, { doc }] of chunk) {
            try {
                const docRef = db.collection(collectionName).doc(id);
                await docRef.set(removeUndefined({
                    text: doc.text,
                    embedding: FieldValue.vector(doc.embedding),
                    metadata: doc.metadata,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }));
                fallbackCache.delete(id);
                migrated++;
            }
            catch (error) {
                failed++;
                log.warn({ id, error: String(error) }, 'Failed to migrate document');
            }
        }
    }
    log.info({ migrated, failed, remaining: fallbackCache.size }, '📥 Cache migration complete');
    return { migrated, failed };
}
//# sourceMappingURL=recovery.js.map