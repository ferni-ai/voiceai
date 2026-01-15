/**
 * Distress Detection Behavioral Builder
 *
 * Dedicated builder for detecting and responding to distress signals.
 * This is a high-priority builder that can override other behaviors.
 *
 * The behavioral approach is especially important for distress:
 * - OLD: "[CRISIS: User mentioned feeling hopeless. Be very careful.]"
 *   Risk: Model might say "I see you mentioned feeling hopeless..."
 *
 * - NEW: { modes: { crisisMode: true }, tone: 'grounding', questionStyle: 'none' }
 *   Result: Model just behaves gently without referencing the detection
 *
 * @module intelligence/context-builders/behavioral/builders/distress
 */

import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals } from '../signals.js';
import { createCrisisSignals, createPresenceSignals } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';
import { DISTRESS } from '../../../detectors/distress.js';

// ============================================================================
// DISTRESS PATTERN DETECTION
// ============================================================================

/**
 * Crisis keywords that indicate immediate concern
 * These should trigger crisis mode regardless of other signals
 */
const CRISIS_KEYWORDS = [
  // Explicit danger
  /\b(want(ing)?|going) to (die|kill|hurt|end)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bself[- ]harm/i,
  /\bdon'?t want to (live|be here|exist)/i,
  /\bend (it|my life|everything)/i,
  /\bno (point|reason) (in|to) (living|going on)/i,

  // Severe distress
  /\bcan'?t (go on|take it|do this|anymore)/i,
  /\b(everyone|they|world) (would be|is) better (off )?without me/i,
  /\bnothing (matters|left)/i,
];

/**
 * Moderate distress indicators
 */
const MODERATE_DISTRESS_PATTERNS = [
  /\b(so|very|really) (tired|exhausted|drained)/i,
  /\b(feel(ing)?|am) (hopeless|helpless|trapped|stuck)/i,
  /\bdon'?t know (what to do|how to cope)/i,
  /\b(overwhelming|unbearable)/i,
  /\bbreaking( down)?/i,
  /\bfalling apart/i,
];

/**
 * Seeking support patterns (need gentle response)
 */
const SEEKING_SUPPORT_PATTERNS = [
  /\bcan (you|we) (just )?talk/i,
  /\bneed(s?)? (someone|to talk|help)/i,
  /\b(feel(ing)?|am) (alone|isolated|lonely)/i,
  /\bno one (understands|cares|listens)/i,
];

/**
 * Check for crisis-level keywords
 */
function hasCrisisKeywords(text: string): boolean {
  return CRISIS_KEYWORDS.some((pattern) => pattern.test(text));
}

/**
 * Check for moderate distress patterns
 */
function hasModerateDistress(text: string): boolean {
  return MODERATE_DISTRESS_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Check for seeking support patterns
 */
function isSeekingSupport(text: string): boolean {
  return SEEKING_SUPPORT_PATTERNS.some((pattern) => pattern.test(text));
}

// ============================================================================
// BEHAVIORAL BUILDER
// ============================================================================

/**
 * Build distress-related behavioral signals
 */
async function buildDistressBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userText, analysis, userData } = input;

  // Get distress level from analysis (may include voice emotion)
  const analysisDistress = analysis.emotion.distressLevel ?? 0;

  // Check text for crisis patterns
  const textHasCrisis = hasCrisisKeywords(userText);
  const textHasModerate = hasModerateDistress(userText);
  const textSeeksSupport = isSeekingSupport(userText);

  // =========================================
  // CRISIS MODE
  // =========================================
  if (textHasCrisis || analysisDistress >= DISTRESS.HIGH) {
    return {
      ...createCrisisSignals(),
      source: 'distress',
      confidence: textHasCrisis ? 0.95 : 0.85, // Higher confidence for explicit keywords
      priority: 100, // Highest priority

      // Add specific avoidances for crisis
      avoidances: [
        'offering solutions or advice',
        'minimizing their feelings',
        'asking why they feel this way',
        'changing the subject',
        'being overly cheerful',
      ],
    };
  }

  // =========================================
  // MODERATE DISTRESS / SEEKING SUPPORT
  // =========================================
  if (textHasModerate || textSeeksSupport || analysisDistress >= DISTRESS.MODERATE) {
    return {
      ...createPresenceSignals(),
      source: 'distress',
      confidence: 0.8,
      priority: 85,

      // Override some presence defaults for moderate distress
      style: 'supportive',
      questionStyle: textSeeksSupport ? 'none' : 'gentle-probe',

      avoidances: ['jumping to solutions', 'minimizing the difficulty', 'comparing to others'],
    };
  }

  // =========================================
  // MILD DISTRESS
  // =========================================
  if (analysisDistress >= DISTRESS.MILD) {
    return {
      source: 'distress',
      confidence: 0.6,
      priority: 60,

      tone: 'gentle',
      pace: 'normal',
      style: 'supportive',
      energy: 'calm',
    };
  }

  // =========================================
  // NO DISTRESS DETECTED
  // =========================================
  return {
    source: 'distress',
    confidence: 0.5,
    priority: 10, // Low priority when no distress
    // No signals - let other builders determine behavior
  };
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerBehavioralBuilder({
  name: 'distress',
  description: 'Distress detection with appropriate behavioral response',
  priority: 5, // Runs very early, can override everything
  category: 'safety',
  build: buildDistressBehavior,
});

export { buildDistressBehavior, hasCrisisKeywords, hasModerateDistress, isSeekingSupport };
