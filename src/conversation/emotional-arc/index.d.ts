/**
 * Emotional Arc Module
 *
 * Clean architecture refactoring of the emotional arc tracker.
 *
 * @module @ferni/conversation/emotional-arc
 */
export type { CrossSessionArcSummary, EmotionalArc, EmotionalResponse, EmotionalSnapshot, NarrativePhase, } from './types.js';
export { EMOTION_VALENCE_MAP } from './types.js';
export { EmotionalArcTracker, default } from './engine.js';
import { EmotionalArcTracker } from './engine.js';
export declare function getEmotionalArcTracker(): EmotionalArcTracker;
export declare function resetEmotionalArcTracker(): void;
//# sourceMappingURL=index.d.ts.map