/**
 * Superhuman Orchestrator Registry
 *
 * Session-scoped singleton management.
 *
 * @module @ferni/superhuman/orchestrator/registry
 */
import { createSessionRegistry, registerGlobalRegistry } from '../../../utils/session-registry.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { BetterThanHumanOrchestrator } from './engine.js';
const logger = createLogger({ module: 'BetterThanHuman' });
/**
 * Session registry for Better Than Human orchestrators.
 */
const orchestratorRegistry = createSessionRegistry((key) => {
    const [userId, sessionId] = key.split(':');
    return new BetterThanHumanOrchestrator(userId, sessionId, 'ferni', 0);
}, {
    name: 'BetterThanHumanOrchestrator',
    cleanup: (orchestrator) => orchestrator.reset(),
    verbose: false,
});
// Register for global session cleanup
registerGlobalRegistry(orchestratorRegistry);
/**
 * Get or create the Better Than Human orchestrator
 */
export function getBetterThanHuman(userId, sessionId, personaId, sessionCount = 0) {
    const key = `${userId}:${sessionId}`;
    if (!orchestratorRegistry.has(key)) {
        const orchestrator = new BetterThanHumanOrchestrator(userId, sessionId, personaId, sessionCount);
        return orchestrator;
    }
    return orchestratorRegistry.get(key);
}
/**
 * Clear orchestrator
 */
export function clearBetterThanHuman(userId, sessionId) {
    orchestratorRegistry.reset(`${userId}:${sessionId}`);
}
/**
 * Get an existing orchestrator for a user without creating a new one.
 */
export function getExistingBetterThanHumanForUser(userId) {
    for (const sessionId of orchestratorRegistry.getActiveSessionIds()) {
        if (sessionId.startsWith(`${userId}:`)) {
            return orchestratorRegistry.get(sessionId);
        }
    }
    return undefined;
}
/**
 * Get count of active orchestrators
 */
export function getOrchestratorCount() {
    return orchestratorRegistry.getActiveCount();
}
/**
 * Clear all orchestrators for a user
 */
export function clearAllBetterThanHumanForUser(userId) {
    const keysToDelete = [];
    for (const key of orchestratorRegistry.getActiveSessionIds()) {
        if (key.startsWith(`${userId}:`)) {
            keysToDelete.push(key);
        }
    }
    for (const key of keysToDelete) {
        orchestratorRegistry.reset(key);
    }
    if (keysToDelete.length > 0) {
        logger.debug({ userId, clearedCount: keysToDelete.length }, '🧹 Cleared user orchestrators');
    }
}
//# sourceMappingURL=registry.js.map