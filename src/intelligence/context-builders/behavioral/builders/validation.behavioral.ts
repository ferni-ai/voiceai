/**
 * Validation Behavioral Builder
 *
 * Detects when users are seeking validation and adjusts behavior accordingly.
 * This is critical - validation must come BEFORE advice.
 *
 * Patterns like "am I crazy" or "is it wrong to" signal that they need
 * to hear their feelings are valid before anything else.
 *
 * @module intelligence/context-builders/behavioral/builders/validation
 */

import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals } from '../signals.js';
import { createCallback } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';

// ============================================================================
// VALIDATION DETECTION
// ============================================================================

/**
 * Patterns that indicate validation-seeking
 */
const VALIDATION_PATTERNS = [
  // Self-doubt patterns
  /\b(am i|is it) (crazy|wrong|bad|stupid|dumb|weird|overreacting)/i,
  /\bshould i (feel|be|have)/i,
  /\bis it (ok|okay|normal|wrong) to/i,
  /\bdo you think i('m| am) (being|overreacting|wrong)/i,

  // Permission-seeking
  /\bis it (ok|okay|alright) (if|that)/i,
  /\bcan i (feel|be|want)/i,
  /\bam i allowed to/i,

  // Judgment-checking
  /\bwhat do you think (of|about) me/i,
  /\bdo you judge me/i,
  /\byou must think i('m| am)/i,

  // Normalization-seeking
  /\banyonn else (feel|experience|deal)/i,
  /\bis this normal/i,
  /\bam i the only one/i,
];

/**
 * Check if text indicates validation-seeking
 */
function detectsValidationSeeking(text: string): boolean {
  return VALIDATION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Intensity indicators - stronger need for validation
 */
const INTENSITY_AMPLIFIERS = [
  /\breally\b/i,
  /\bactually\b/i,
  /\bhonestly\b/i,
  /\bseriously\b/i,
  /\bi know (this is|it's) (stupid|dumb|silly)/i,
];

/**
 * Check if there are intensity amplifiers
 */
function hasIntensityAmplifiers(text: string): boolean {
  return INTENSITY_AMPLIFIERS.some((pattern) => pattern.test(text));
}

// ============================================================================
// BEHAVIORAL BUILDER
// ============================================================================

async function buildValidationBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userText, analysis } = input;

  // Check for explicit validation patterns
  const needsValidation = detectsValidationSeeking(userText || '');
  const hasAmplifiers = hasIntensityAmplifiers(userText || '');

  // Also check analysis signals
  const emotionNeedsSupport = analysis?.emotion?.needsSupport || false;
  const isConfiding = analysis?.intent?.primary === 'confiding';
  const isNegativeValence = analysis?.emotion?.valence === 'negative';

  // Determine if validation is needed
  const validationNeeded =
    needsValidation ||
    (emotionNeedsSupport && isConfiding) ||
    (needsValidation && isNegativeValence);

  if (!validationNeeded) {
    // No validation signals - return empty (other builders handle)
    return {
      source: 'validation',
      confidence: 0.3,
      priority: 0, // Very low when not triggered
    };
  }

  // Validation IS needed
  const signals: BehavioralSignals = {
    source: 'validation',
    confidence: hasAmplifiers ? 0.95 : 0.85,
    priority: 70, // High priority - validation comes first

    tone: 'warm',
    style: 'supportive',
    questionStyle: 'reflective', // Reflect back, don't probe

    avoidances: [
      'giving advice before validating',
      'using "but" after acknowledgment',
      'offering solutions immediately',
      'minimizing their concern',
      'being logical before being compassionate',
    ],

    callbacks: [
      createCallback(
        'pattern',
        'They need validation first. Acknowledge their feelings are understandable before anything else.',
        'important'
      ),
    ],
  };

  // Stronger intensity = even more focused on validation
  if (hasAmplifiers) {
    signals.length = 'brief'; // Don't overload - just validate
    signals.callbacks?.push(
      createCallback(
        'pattern',
        "They're really seeking reassurance. Pure validation, no 'however' or 'but'.",
        'important'
      )
    );
  }

  return signals;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerBehavioralBuilder({
  name: 'validation',
  description: 'Detects validation-seeking and prioritizes acknowledgment',
  priority: 25, // Runs fairly early to set validation mode
  category: 'emotional',
  build: buildValidationBehavior,
});

export { buildValidationBehavior, detectsValidationSeeking };
