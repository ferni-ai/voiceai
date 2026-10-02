/**
 * Crisis Guard - Hard Safety Rails
 *
 * Runs on the caller's words BEFORE the LLM (see turn-processor/process-turn.ts):
 *
 * 1. detectCrisis scores explicit and implicit crisis indicators, plus voice distress
 * 2. guardPreResponse replaces the reply with a pre-written one that includes
 *    988 resources when severity >= 0.85
 *
 * Below that threshold the crisis result reaches the LLM as injected context;
 * nothing inspects or rewrites the reply after it is generated.
 *
 * @module CrisisGuard
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisGuard' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceEmotionContext {
  primary: string;
  intensity: number;
  confidence?: number;
}

export interface CrisisGuardResult {
  /** If true, block the response entirely and use replacement */
  shouldBlock: boolean;
  /** Reason for blocking (for logging) */
  reason?: string;
  /** Complete replacement response (if shouldBlock is true) */
  replacementResponse?: string;
  /** Detected crisis severity (0-1) */
  crisisSeverity: number;
  /** Whether this is a crisis situation */
  isCrisis: boolean;
}

export interface CrisisDetectionResult {
  isCrisis: boolean;
  severity: number;
  indicators: string[];
  suggestedResponse?: string;
}

// ============================================================================
// CRISIS PATTERNS
// ============================================================================

/**
 * Explicit crisis indicators - immediate red flags.
 *
 * Only language that is unambiguous about self-harm belongs here: a match
 * alone replaces the model's reply with the 988 script. Everyday idioms that
 * merely sound hopeless ("what's the point of this meeting", "I want to die of
 * embarrassment") live in IMPLICIT_DISTRESS_PATTERNS, where they block only
 * when voice distress corroborates them.
 */
const EXPLICIT_CRISIS_PATTERNS = [
  // Suicidal ideation. "die" excludes idioms: die of/from embarrassment, die laughing.
  /want(ing)? to (die\b(?! (of|from|laughing)\b)|kill myself|not (be here|exist|wake up))/i,
  // "end it" only when nothing follows (or "all"): excludes "end it with him".
  /want(ing)? to end (it all|my life|it\s*[.!?]*$)/i,
  /don't want to (live|be alive|exist|be here anymore)/i,
  /(thinking about|consider(ing)?) (suicide|ending (it|my life)|killing myself)/i,
  /no (point|reason) (in|to) (go(ing)? on )?(living|going on|continuing)/i,
  // "end/take my (own) life" — excludes recovery language: "take my life back / in a new direction".
  /\b(end|take) my (own )?life\b(?! (back|in|into|to|forward)\b)/i,
  /\b(have|got|made|making) a plan to (kill myself|end (it|my life))/i,
  /\bcan't go on living\b/i,
  /(would|should) (be|everyone) better off (without me|if i (was|were) gone)/i,

  // Self-harm. Excludes "cutting myself a slice", "burning myself out".
  /(want to|going to|thinking about) hurt(ing)? myself/i,
  /\b(cutting|burning|harming) myself\b(?! (a|an|some|off|out|slack|short)\b)/i,
];

/** Implicit distress indicators - need gentle exploration */
const IMPLICIT_DISTRESS_PATTERNS = [
  /everything is (falling apart|too much|overwhelming)/i,
  /can't (breathe|handle|cope|function)/i,
  /nobody (cares|would (miss|notice))/i,
  /I'm (such a|a complete) (failure|burden|mess)/i,
  /I (hate|can't stand) myself/i,
  /feeling (so )?alone/i,
  /\bfeel(ing)? (so |really )?(trapped|stuck)\b|\bno way out\b/i,

  // Hopelessness. Ambiguous on text alone ("there's no point arguing with him");
  // voice distress lifts these past the block threshold.
  /can't (do this|keep going|take it) anymore/i,
  /nothing (will ever|is ever going to) (change|get better)/i,
  /there's no (hope|point)/i,
  /what's (even )?the point/i,
  /\bwant (it|this|everything|the pain) to (stop|end) (for good|forever)\b/i,
];

/** Patterns that indicate high distress from voice */
const HIGH_DISTRESS_VOICE_EMOTIONS = [
  'distressed',
  'panicked',
  'desperate',
  'hopeless',
  'suicidal',
];

/** Patterns that indicate moderate distress requiring care */
const MODERATE_DISTRESS_VOICE_EMOTIONS = ['anxious', 'sad', 'hurt', 'scared', 'overwhelmed'];

// ============================================================================
// CRISIS DETECTION
// ============================================================================

/**
 * Detect crisis indicators in user message
 */
export function detectCrisis(
  userMessage: string,
  voiceEmotion?: VoiceEmotionContext
): CrisisDetectionResult {
  const indicators: string[] = [];
  let severity = 0;

  const lowerMessage = userMessage.toLowerCase();

  // Check explicit crisis patterns
  for (const pattern of EXPLICIT_CRISIS_PATTERNS) {
    if (pattern.test(lowerMessage)) {
      indicators.push('explicit_crisis_language');
      severity = Math.max(severity, 0.9);
      break;
    }
  }

  // Check implicit distress patterns
  for (const pattern of IMPLICIT_DISTRESS_PATTERNS) {
    if (pattern.test(lowerMessage)) {
      indicators.push('implicit_distress');
      severity = Math.max(severity, 0.6);
      break;
    }
  }

  // Voice emotion amplifies severity
  if (voiceEmotion && voiceEmotion.confidence && voiceEmotion.confidence > 0.5) {
    if (HIGH_DISTRESS_VOICE_EMOTIONS.includes(voiceEmotion.primary)) {
      indicators.push('voice_high_distress');
      severity = Math.max(severity, 0.85);
    } else if (MODERATE_DISTRESS_VOICE_EMOTIONS.includes(voiceEmotion.primary)) {
      // Only amplify if there are text indicators too
      if (severity > 0.3) {
        indicators.push('voice_moderate_distress');
        severity = Math.min(1.0, severity + 0.15);
      }
    }
  }

  // High voice intensity amplifies severity
  if (voiceEmotion && voiceEmotion.intensity > 0.8 && severity > 0.3) {
    severity = Math.min(1.0, severity + 0.1);
    indicators.push('high_voice_intensity');
  }

  const isCrisis = severity >= 0.7;

  return {
    isCrisis,
    severity,
    indicators,
    suggestedResponse: isCrisis ? getCrisisResponse(severity) : undefined,
  };
}

/**
 * Get appropriate crisis response based on severity
 */
function getCrisisResponse(severity: number): string {
  if (severity >= 0.85) {
    // Severe crisis - immediate support + resources
    return `I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?`;
  } else {
    // High distress - validate + gentle support
    return `I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?`;
  }
}

// ============================================================================
// PRE-RESPONSE GUARD
// ============================================================================

/**
 * Guard that runs BEFORE LLM generates response
 *
 * Checks user message for crisis indicators.
 * If crisis detected, may provide replacement response.
 */
export function guardPreResponse(
  userMessage: string,
  voiceEmotion?: VoiceEmotionContext
): CrisisGuardResult {
  const crisis = detectCrisis(userMessage, voiceEmotion);

  if (crisis.isCrisis && crisis.severity >= 0.85) {
    // Severe crisis - override with crisis response
    log.warn(
      {
        severity: crisis.severity,
        indicators: crisis.indicators,
      },
      '🚨 CRISIS DETECTED - Overriding response'
    );

    return {
      shouldBlock: true,
      reason: `Crisis detected (severity: ${crisis.severity.toFixed(2)})`,
      replacementResponse: crisis.suggestedResponse,
      crisisSeverity: crisis.severity,
      isCrisis: true,
    };
  }

  return {
    shouldBlock: false,
    crisisSeverity: crisis.severity,
    isCrisis: crisis.isCrisis,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectCrisis,
  guardPreResponse,
};
