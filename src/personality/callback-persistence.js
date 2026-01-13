/**
 * Callback Persistence Service
 *
 * Saves detected callback-worthy moments (the "smile factor") to persistent storage.
 * This is what makes users feel remembered - we detect important moments they share
 * and follow up on them in future conversations.
 *
 * Uses the existing memory store infrastructure (Firestore in production).
 *
 * @module personality/callback-persistence
 */
import { getDefaultStore } from '../memory/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { extractCallbackKeyMoments } from './memory-adapter.js';
const log = createLogger({ module: 'CallbackPersistence' });
// ============================================================================
// SAVE CALLBACKS
// ============================================================================
/**
 * Extract and save callback-worthy moments from a user message
 *
 * Call this after processing user input to persist callbacks for future follow-up.
 *
 * @param userId - The user's ID
 * @param userMessage - The user's message to analyze
 * @returns Summary of what was saved
 */
export async function extractAndSaveCallbacks(userId, userMessage) {
    const result = {
        saved: 0,
        skipped: 0,
        errors: 0,
        momentIds: [],
    };
    if (!userId || !userMessage) {
        return result;
    }
    // Extract callback-worthy moments
    const callbacks = extractCallbackKeyMoments(userMessage);
    if (callbacks.length === 0) {
        return result;
    }
    log.debug({ userId, count: callbacks.length }, '💝 Extracting callbacks to save');
    // Get the memory store
    const store = getDefaultStore();
    for (const callback of callbacks) {
        try {
            // Check if we already have a similar recent callback
            const existing = await store.getKeyMoments(userId, { limit: 20 });
            const isDuplicate = existing.some((m) => m.type === callback.type &&
                m.summary === callback.summary &&
                Date.now() - new Date(m.timestamp).getTime() < 24 * 60 * 60 * 1000 // Within 24 hours
            );
            if (isDuplicate) {
                result.skipped++;
                log.debug({ momentId: callback.id, type: callback.type }, 'Skipping duplicate callback');
                continue;
            }
            // Save the callback
            await store.addKeyMoment(userId, callback);
            result.saved++;
            result.momentIds.push(callback.id);
            log.info({
                userId,
                momentId: callback.id,
                type: callback.type,
                followUpNeeded: callback.followUpNeeded,
            }, '💝 Callback saved for follow-up');
        }
        catch (error) {
            result.errors++;
            log.warn({ error, momentId: callback.id }, 'Failed to save callback');
        }
    }
    if (result.saved > 0) {
        log.info({ userId, saved: result.saved, types: callbacks.map((c) => c.type) }, '✅ Callbacks persisted');
    }
    return result;
}
/**
 * Save a single KeyMoment directly
 *
 * Use this when you already have a KeyMoment object constructed.
 */
export async function saveKeyMoment(userId, moment) {
    if (!userId || !moment) {
        return false;
    }
    try {
        const store = getDefaultStore();
        await store.addKeyMoment(userId, moment);
        log.info({ userId, momentId: moment.id, type: moment.type }, '💝 Key moment saved');
        return true;
    }
    catch (error) {
        log.warn({ error, userId, momentId: moment.id }, 'Failed to save key moment');
        return false;
    }
}
/**
 * Mark a callback as completed (no longer needs follow-up)
 */
export async function markCallbackComplete(userId, momentId) {
    if (!userId || !momentId) {
        return false;
    }
    try {
        const store = getDefaultStore();
        const moments = await store.getKeyMoments(userId, { limit: 100 });
        const moment = moments.find((m) => m.id === momentId);
        if (!moment) {
            log.warn({ userId, momentId }, 'Callback not found');
            return false;
        }
        // Update the moment to mark follow-up complete
        const updated = {
            ...moment,
            followUpNeeded: false,
        };
        await store.addKeyMoment(userId, updated);
        log.info({ userId, momentId }, '✅ Callback marked complete');
        return true;
    }
    catch (error) {
        log.warn({ error, userId, momentId }, 'Failed to mark callback complete');
        return false;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    extractAndSaveCallbacks,
    saveKeyMoment,
    markCallbackComplete,
};
//# sourceMappingURL=callback-persistence.js.map