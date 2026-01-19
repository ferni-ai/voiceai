/**
 * Emotional Momentum Module
 *
 * Track emotional trajectory within conversation, not just point-in-time emotion.
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   getEmotionalMomentumTracker,
 * } from './conversation/emotional-arc/momentum/index.js';
 *
 * const tracker = getEmotionalMomentumTracker();
 *
 * // Record each turn's emotional state
 * tracker.recordTurn(sessionId, {
 *   turn: turnCount,
 *   emotion: 'anxious',
 *   valence: -0.4,
 *   arousal: 0.6,
 *   topic: 'work',
 *   trigger: 'mentioned deadline',
 * });
 *
 * // Check current trajectory
 * const trajectory = tracker.getTrajectory(sessionId);
 * // 'improving' | 'declining' | 'spiral-down' | etc.
 *
 * // Check if intervention needed
 * const intervention = tracker.checkIntervention(sessionId);
 * if (intervention) {
 *   // Apply intervention
 *   console.log(intervention.script);
 *   console.log('Avoid topics:', intervention.avoidTopics);
 *   console.log('Return to:', intervention.returnToTopic);
 * }
 *
 * // Get safe and risky topics
 * const safeTopics = tracker.getSafeTopics(sessionId);
 * const riskyTopics = tracker.getRiskyTopics(sessionId);
 *
 * // Get full momentum state
 * const momentum = tracker.getMomentum(sessionId);
 * console.log('Turning points:', momentum?.turningPoints);
 * console.log('Prediction:', momentum?.prediction);
 * ```
 *
 * @module @ferni/conversation/emotional-arc/momentum
 */

// Types
export type {
  EmotionSnapshot,
  EmotionalTrajectory,
  TurningPoint,
  TrajectoryPrediction,
  InterventionGuidance,
  EmotionalMomentum,
  IEmotionalMomentumTracker,
} from './types.js';

export { EmotionalMomentumToken } from './types.js';

// Constants
export {
  THRESHOLDS,
  MAGNITUDE_THRESHOLDS,
  INTERVENTION_SCRIPTS,
  TRAJECTORY_INTERVENTION_MAP,
  EMOTION_VALENCE_MAP,
  emotionToValence,
  RISK_FACTOR_PATTERNS,
} from './constants.js';

// Tracker
export {
  EmotionalMomentumTracker,
  getEmotionalMomentumTracker,
  createEmotionalMomentumTracker,
  resetEmotionalMomentumTracker,
} from './tracker.js';
