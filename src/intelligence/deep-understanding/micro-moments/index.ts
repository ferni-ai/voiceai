/**
 * Micro-Moment Recognition Module
 *
 * Catch the small moments humans miss. The micro-shifts that signal growth,
 * vulnerability, or change. These moments deserve acknowledgment.
 *
 * ## Usage
 *
 * ```typescript
 * import { getMicroMomentDetector } from './intelligence/deep-understanding/micro-moments/index.js';
 *
 * const detector = getMicroMomentDetector();
 *
 * // Detect micro-moments in a message
 * const analysis = detector.detect({
 *   message: "I've never told anyone this before, but...",
 *   emotionalState: 'vulnerable',
 *   topic: 'personal',
 * });
 *
 * if (analysis.hasSignificantMoment) {
 *   const primary = analysis.primaryMoment!;
 *   console.log('Detected:', primary.type);
 *   console.log('Suggested response:', primary.acknowledgment.phrase);
 *
 *   // Get context injection for LLM
 *   const contextInjection = detector.buildContextInjection(analysis);
 * }
 * ```
 *
 * ## 8 Micro-Moment Types
 *
 * 1. `vulnerability-edge` - "I've never told anyone..."
 * 2. `small-win` - "I almost made it to..."
 * 3. `relationship-shift` - Changed how they refer to someone
 * 4. `language-change` - "We" instead of "I"
 * 5. `hope-glimmer` - "Maybe things could..."
 * 6. `self-compassion` - "I guess it's okay that..."
 * 7. `boundary-attempt` - Trying to set limits
 * 8. `growth-evidence` - Evidence of change
 *
 * @module @ferni/intelligence/deep-understanding/micro-moments
 */

// Types
export type {
  MicroMomentType,
  MicroMoment,
  MicroMomentAcknowledgment,
  MicroMomentAnalysis,
  MicroMomentContext,
  IMicroMomentDetector,
  MicroMomentRule,
} from './types.js';

export { MicroMomentToken } from './types.js';

// Detection rules
export {
  MICRO_MOMENT_RULES,
  ACKNOWLEDGMENT_PHRASES,
  ACKNOWLEDGMENT_SSML,
  getRandomPhrase,
  getRandomSsml,
  getRuleForType,
} from './detection-rules.js';

// Engine
export {
  MicroMomentDetector,
  getMicroMomentDetector,
  createMicroMomentDetector,
  resetMicroMomentDetector,
} from './engine.js';
