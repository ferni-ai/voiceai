/**
 * Pronunciation Memory Session Management
 *
 * @module speech/pronunciation-memory/session
 */
import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';
import { PronunciationMemoryService } from './service.js';
// ============================================================================
// SESSION REGISTRY MANAGEMENT
// ============================================================================
/**
 * Session registry for pronunciation memory services.
 * Provides automatic cleanup and lifecycle management.
 */
const pronunciationMemoryRegistry = createSessionRegistry((sessionId) => new PronunciationMemoryService(sessionId), {
    name: 'PronunciationMemory',
    cleanup: (service) => service.reset(),
    verbose: false,
});
// Register globally for coordinated session cleanup
registerGlobalRegistry(pronunciationMemoryRegistry);
/**
 * Get or create pronunciation memory for a session
 */
export function getPronunciationMemory(sessionId) {
    return pronunciationMemoryRegistry.get(sessionId);
}
/**
 * Reset pronunciation memory for a session
 */
export function resetPronunciationMemory(sessionId) {
    pronunciationMemoryRegistry.reset(sessionId);
}
/**
 * Reset all pronunciation memories
 */
export function resetAllPronunciationMemory() {
    pronunciationMemoryRegistry.resetAll();
}
/**
 * Check if pronunciation memory exists for a session
 */
export function hasPronunciationMemory(sessionId) {
    return pronunciationMemoryRegistry.has(sessionId);
}
/**
 * Get count of active pronunciation memories
 */
export function getActivePronunciationMemoryCount() {
    return pronunciationMemoryRegistry.getActiveCount();
}
//# sourceMappingURL=session.js.map