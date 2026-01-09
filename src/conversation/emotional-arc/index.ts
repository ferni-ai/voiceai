/**
 * Emotional Arc Module
 *
 * Clean architecture refactoring of the emotional arc tracker.
 *
 * @module @ferni/conversation/emotional-arc
 */

// Types
export type {
  CrossSessionArcSummary,
  EmotionalArc,
  EmotionalResponse,
  EmotionalSnapshot,
  NarrativePhase,
} from './types.js';

export { EMOTION_VALENCE_MAP } from './types.js';

// Engine
export { EmotionalArcTracker, default } from './engine.js';

// ============================================================================
// SINGLETON
// ============================================================================

import { EmotionalArcTracker } from './engine.js';

let instance: EmotionalArcTracker | null = null;

export function getEmotionalArcTracker(): EmotionalArcTracker {
  if (!instance) {
    instance = new EmotionalArcTracker();
  }
  return instance;
}

export function resetEmotionalArcTracker(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}
