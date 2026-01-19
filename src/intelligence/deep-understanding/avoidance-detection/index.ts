/**
 * Avoidance Pattern Detection Module
 *
 * Detect when users consistently avoid certain topics. Not to push—to understand.
 *
 * ## Usage
 *
 * ```typescript
 * import { getAvoidanceDetector } from './intelligence/deep-understanding/avoidance-detection/index.js';
 *
 * const detector = getAvoidanceDetector();
 *
 * // Detect avoidance in a message
 * const analysis = await detector.detect({
 *   message: "Anyway, let's talk about something else.",
 *   previousMessage: "How are things at work?",
 *   previousTopic: "work",
 *   turnNumber: 5,
 *   sessionId: 'session-123',
 *   userId: 'user-456',
 * });
 *
 * if (analysis.hasAvoidance) {
 *   console.log('Avoidance detected:', analysis.primarySignal?.type);
 *   console.log('Topic avoided:', analysis.primarySignal?.avoidedTopic);
 *   console.log('Approach:', analysis.suggestedApproach.action);
 *
 *   // Build context injection for LLM
 *   const contextInjection = detector.buildContextInjection(analysis);
 * }
 *
 * // Get cross-session patterns
 * const patterns = await detector.getPatterns('user-456');
 * const strongPatterns = await detector.getStrongPatterns('user-456');
 * ```
 *
 * ## 7 Signal Types
 *
 * 1. `topic_change` - Abrupt topic shift
 * 2. `vague_response` - Non-committal, surface-level answer
 * 3. `deflection` - Redirecting to someone/something else
 * 4. `minimization` - "It's not a big deal"
 * 5. `humor_shield` - Using humor to avoid depth
 * 6. `generalization` - "Everyone goes through this"
 * 7. `time_pressure` - "We don't have time for that now"
 *
 * @module @ferni/intelligence/deep-understanding/avoidance-detection
 */

// Types
export type {
  AvoidanceSignalType,
  AvoidanceSignal,
  AvoidancePattern,
  AvoidanceAnalysis,
  AvoidanceContext,
  AvoidanceApproach,
  IAvoidanceDetector,
  AvoidanceRule,
} from './types.js';

export { AvoidanceDetectorToken } from './types.js';

// Detection rules
export {
  AVOIDANCE_RULES,
  GENTLE_INQUIRY_WORDINGS,
  THRESHOLDS,
  getRuleByType,
  getGentleInquiry,
} from './detection-rules.js';

// Persistence
export {
  saveSignal,
  getPatterns,
  getStrongPatterns,
  getPatternsByTopics,
  acknowledgePattern,
  getSessionSignals,
  clearUserData,
} from './persistence.js';

// Engine
export {
  AvoidanceDetector,
  getAvoidanceDetector,
  createAvoidanceDetector,
  resetAvoidanceDetector,
} from './engine.js';
