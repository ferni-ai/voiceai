/**
 * Emotional Arc Module
 *
 * Clean architecture refactoring of the emotional arc tracker.
 *
 * @module @ferni/conversation/emotional-arc
 */
export { EMOTION_VALENCE_MAP } from './types.js';
// Engine
export { EmotionalArcTracker, default } from './engine.js';
// ============================================================================
// SINGLETON
// ============================================================================
import { EmotionalArcTracker } from './engine.js';
let instance = null;
export function getEmotionalArcTracker() {
    if (!instance) {
        instance = new EmotionalArcTracker();
    }
    return instance;
}
export function resetEmotionalArcTracker() {
    if (instance) {
        instance.reset();
    }
    instance = null;
}
//# sourceMappingURL=index.js.map