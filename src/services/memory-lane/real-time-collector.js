/**
 * Memory Lane Real-Time Collector
 *
 * Integration hooks for capturing memories in real-time as they occur
 * during conversations. These hooks are called by other services when
 * memory-worthy moments happen.
 *
 * @module services/memory-lane/real-time-collector
 */
import { createLogger } from '../../utils/safe-logger.js';
import { processCollectionInput } from './memory-collector.js';
const log = createLogger({ module: 'MemoryLaneRealTime' });
// ============================================================================
// RATE LIMITING
// ============================================================================
// Prevent duplicate captures within a short window
const recentCaptures = new Map();
const CAPTURE_COOLDOWN_MS = 5000; // 5 seconds
function isDuplicateCapture(userId, sourceType, sourceId) {
    const key = `${userId}:${sourceType}:${sourceId}`;
    const lastCapture = recentCaptures.get(key);
    const now = Date.now();
    if (lastCapture && now - lastCapture < CAPTURE_COOLDOWN_MS) {
        return true;
    }
    recentCaptures.set(key, now);
    // Cleanup old entries periodically
    if (recentCaptures.size > 1000) {
        const cutoff = now - CAPTURE_COOLDOWN_MS * 2;
        for (const [k, v] of recentCaptures.entries()) {
            if (v < cutoff)
                recentCaptures.delete(k);
        }
    }
    return false;
}
// ============================================================================
// CAPTURE FUNCTIONS
// ============================================================================
/**
 * Capture a commitment as a potential memory
 */
export async function captureCommitment(event) {
    if (isDuplicateCapture(event.userId, 'commitment', event.commitmentId)) {
        return;
    }
    try {
        await processCollectionInput({
            userId: event.userId,
            sourceType: 'commitment_kept',
            sourceId: event.commitmentId,
            rawContent: event.text,
            occurredAt: new Date(),
            personaId: event.personaId,
        });
        log.debug({ userId: event.userId, commitmentId: event.commitmentId }, 'Captured commitment memory');
    }
    catch (error) {
        log.warn({ error: String(error), userId: event.userId }, 'Failed to capture commitment memory');
    }
}
/**
 * Capture a dream as a potential memory
 */
export async function captureDream(event) {
    if (isDuplicateCapture(event.userId, 'dream', event.dreamId)) {
        return;
    }
    try {
        await processCollectionInput({
            userId: event.userId,
            sourceType: 'dream_progress',
            sourceId: event.dreamId,
            rawContent: event.statement,
            occurredAt: new Date(),
            personaId: event.personaId,
        });
        log.debug({ userId: event.userId, dreamId: event.dreamId }, 'Captured dream memory');
    }
    catch (error) {
        log.warn({ error: String(error), userId: event.userId }, 'Failed to capture dream memory');
    }
}
/**
 * Capture an inside joke as a potential memory
 */
export async function captureInsideJoke(event) {
    if (isDuplicateCapture(event.userId, 'inside_joke', event.jokeId)) {
        return;
    }
    try {
        await processCollectionInput({
            userId: event.userId,
            sourceType: 'inside_joke',
            sourceId: event.jokeId,
            rawContent: event.joke,
            occurredAt: new Date(),
            personaId: event.personaId,
        });
        log.debug({ userId: event.userId, jokeId: event.jokeId }, 'Captured inside joke memory');
    }
    catch (error) {
        log.warn({ error: String(error), userId: event.userId }, 'Failed to capture inside joke memory');
    }
}
/**
 * Capture a milestone as a potential memory
 */
export async function captureMilestone(event) {
    if (isDuplicateCapture(event.userId, 'milestone', event.milestoneId)) {
        return;
    }
    try {
        const content = event.description ? `${event.title}: ${event.description}` : event.title;
        await processCollectionInput({
            userId: event.userId,
            sourceType: 'milestone_reached',
            sourceId: event.milestoneId,
            rawContent: content,
            occurredAt: new Date(),
            personaId: event.personaId,
        });
        log.debug({ userId: event.userId, milestoneId: event.milestoneId }, 'Captured milestone memory');
    }
    catch (error) {
        log.warn({ error: String(error), userId: event.userId }, 'Failed to capture milestone memory');
    }
}
/**
 * Capture a celebration as a potential memory
 */
export async function captureCelebration(event) {
    if (isDuplicateCapture(event.userId, 'celebration', event.celebrationId)) {
        return;
    }
    try {
        await processCollectionInput({
            userId: event.userId,
            sourceType: 'celebration',
            sourceId: event.celebrationId,
            rawContent: event.description,
            occurredAt: new Date(),
            personaId: event.personaId,
        });
        log.debug({ userId: event.userId, celebrationId: event.celebrationId }, 'Captured celebration memory');
    }
    catch (error) {
        log.warn({ error: String(error), userId: event.userId }, 'Failed to capture celebration memory');
    }
}
/**
 * Generic memory capture for conversation moments
 */
export async function captureConversationMoment(event) {
    if (isDuplicateCapture(event.userId, 'conversation', event.momentId)) {
        return;
    }
    try {
        await processCollectionInput({
            userId: event.userId,
            sourceType: 'conversation_extract',
            sourceId: event.momentId,
            rawContent: event.content,
            occurredAt: new Date(),
            personaId: event.personaId,
        });
        log.debug({ userId: event.userId, momentId: event.momentId }, 'Captured conversation moment');
    }
    catch (error) {
        log.warn({ error: String(error), userId: event.userId }, 'Failed to capture conversation moment');
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const memoryLaneRealTime = {
    captureCommitment,
    captureDream,
    captureInsideJoke,
    captureMilestone,
    captureCelebration,
    captureConversationMoment,
};
//# sourceMappingURL=real-time-collector.js.map