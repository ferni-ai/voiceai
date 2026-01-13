/**
 * Emotional Arc Tracker
 *
 * ⚠️ This file has been refactored for clean architecture.
 * The implementation is now in the emotional-arc/ directory.
 *
 * This file re-exports everything for backward compatibility.
 *
 * @see emotional-arc/index.ts for the new module structure
 * @module @ferni/conversation/emotional-arc
 */
// Re-export everything from the new module
export { EMOTION_VALENCE_MAP, 
// Engine and singleton
EmotionalArcTracker, getEmotionalArcTracker, resetEmotionalArcTracker, default, } from './emotional-arc/index.js';
//# sourceMappingURL=emotional-arc.js.map