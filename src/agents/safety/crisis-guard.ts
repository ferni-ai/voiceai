/**
 * Crisis Guard - Hard Safety Rails
 *
 * This module provides HARD safety rails that CANNOT be bypassed.
 * It runs BEFORE and AFTER LLM responses to ensure:
 *
 * 1. Crisis indicators always trigger appropriate response
 * 2. Dismissive language is blocked during distress
 * 3. Resources are always provided when needed
 * 4. User safety is never compromised
 *
 * These guards are NOT suggestions - they are enforced.
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

export interface CrisisGuardContext {
  crisisDetected: boolean;
  crisisSeverity: number;
  emotionalMismatch: boolean;
  voiceEmotion?: VoiceEmotionContext;
  isHighDistress: boolean;
}

export interface CrisisGuardResult {
  /** If true, block the response entirely and use replacement */
  shouldBlock: boolean;
  /** Reason for blocking (for logging) */
  reason?: string;
  /** Additions that MUST be appended to response */
  requiredAdditions?: string[];
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

/** Explicit crisis indicators - immediate red flags */
const EXPLICIT_CRISIS_PATTERNS = [
  // Suicidal ideation
  /want(ing)? to (die|end it|kill myself|not (be here|exist|wake up))/i,
  /don't want to (live|be alive|exist|be here anymore)/i,
  /(thinking about|consider(ing)?) (suicide|ending (it|my life)|killing myself)/i,
  /no (point|reason) (in|to) (living|going on|continuing)/i,
  /(would|should) (be|everyone) better off (without me|if i (was|were) gone)/i,
  /can't (do this|keep going|take it) anymore/i,

  // Self-harm
  /(want to|going to|thinking about) hurt(ing)? myself/i,
  /cutting myself|burning myself|harming myself/i,

  // Hopelessness
  /nothing (will ever|is ever going to) (change|get better)/i,
  /there's no (hope|way out|point)/i,
  /what's (even )?the point/i,
];

/** Implicit distress indicators - need gentle exploration */
const IMPLICIT_DISTRESS_PATTERNS = [
  /everything is (falling apart|too much|overwhelming)/i,
  /can't (breathe|handle|cope|function)/i,
  /nobody (cares|would (miss|notice))/i,
  /I'm (such a|a complete) (failure|burden|mess)/i,
  /I (hate|can't stand) myself/i,
  /feeling (so )?alone/i,
  /trapped|stuck|no way out/i,
];

/** Dismissive response patterns - NEVER use during distress */
const DISMISSIVE_PATTERNS = [
  /just (relax|calm down|breathe|chill)/i,
  /don't (worry|stress|overthink)/i,
  /you('ll| will) be (fine|okay|alright)/i,
  /it's (not|no) (that )?big (of a )?deal/i,
  /everyone (feels|goes through|experiences) (this|that)/i,
  /things (will|could) be worse/i,
  /look on the bright side/i,
  /at least (you have|you're|it's)/i,
  /have you tried (not|just)/i,
  /you (just )?need to (be more )?positive/i,
  /cheer up/i,
  /snap out of it/i,
  /it('s| is) (all )?in your head/i,
  /you're (over)?reacting/i,
  /that's (not|nothing) (to|worth) (worry|stress)/i,
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
// POST-RESPONSE GUARD
// ============================================================================

/**
 * Guard that runs AFTER LLM generates response
 *
 * Ensures response doesn't contain dismissive language during distress.
 * Ensures crisis resources are included when needed.
 */
export function guardPostResponse(
  response: string,
  context: CrisisGuardContext
): CrisisGuardResult {
  const result: CrisisGuardResult = {
    shouldBlock: false,
    crisisSeverity: context.crisisSeverity,
    isCrisis: context.crisisDetected,
  };

  const lowerResponse = response.toLowerCase();

  // 1. If crisis detected, ensure resources are mentioned
  if (context.crisisDetected) {
    const hasResources = lowerResponse.includes('988') || lowerResponse.includes('crisis line');

    if (!hasResources) {
      result.requiredAdditions = result.requiredAdditions || [];
      result.requiredAdditions.push(
        "\n\nIf you're in crisis, please reach out to the 988 Suicide & Crisis Lifeline (call or text 988) - they're available 24/7."
      );

      log.info('Adding crisis resources to response');
    }
  }

  // 2. Block dismissive patterns during high distress
  if (context.isHighDistress || context.emotionalMismatch) {
    for (const pattern of DISMISSIVE_PATTERNS) {
      if (pattern.test(lowerResponse)) {
        result.shouldBlock = true;
        result.reason = `Response contains dismissive pattern during distress: ${pattern.source}`;

        log.warn({ pattern: pattern.source }, '🚫 Blocking dismissive response');

        return result;
      }
    }
  }

  // 3. If emotional mismatch detected, ensure response acknowledges
  if (context.emotionalMismatch) {
    const acknowledgmentPatterns = [/hear|notice|sense|feel|seem/i, /what.*(really|actually)/i];

    const hasAcknowledgment = acknowledgmentPatterns.some((p) => p.test(lowerResponse));

    if (!hasAcknowledgment) {
      // Don't block, but add acknowledgment
      result.requiredAdditions = result.requiredAdditions || [];
      result.requiredAdditions.unshift(
        "I notice something in your voice that doesn't quite match your words. "
      );

      log.debug('Adding emotional mismatch acknowledgment');
    }
  }

  return result;
}

// ============================================================================
// HELPER: Build Context
// ============================================================================

/**
 * Build crisis guard context from available data
 */
export function buildCrisisGuardContext(
  crisisResult: CrisisDetectionResult,
  voiceEmotion?: VoiceEmotionContext,
  emotionalMismatch?: boolean
): CrisisGuardContext {
  const isHighDistress =
    crisisResult.isCrisis ||
    (voiceEmotion &&
      HIGH_DISTRESS_VOICE_EMOTIONS.includes(voiceEmotion.primary) &&
      voiceEmotion.intensity > 0.7);

  return {
    crisisDetected: crisisResult.isCrisis,
    crisisSeverity: crisisResult.severity,
    emotionalMismatch: emotionalMismatch ?? false,
    voiceEmotion,
    isHighDistress: isHighDistress ?? false,
  };
}

// ============================================================================
// HELPER: Apply Guard Results
// ============================================================================

/**
 * Apply guard results to a response
 */
export function applyGuardResult(originalResponse: string, guardResult: CrisisGuardResult): string {
  if (guardResult.shouldBlock && guardResult.replacementResponse) {
    return guardResult.replacementResponse;
  }

  let response = originalResponse;

  if (guardResult.requiredAdditions && guardResult.requiredAdditions.length > 0) {
    for (const addition of guardResult.requiredAdditions) {
      // Add at beginning if it's an acknowledgment
      if (addition.includes('notice')) {
        response = addition + response;
      } else {
        // Add at end if it's resources
        response = response + addition;
      }
    }
  }

  return response;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectCrisis,
  guardPreResponse,
  guardPostResponse,
  buildCrisisGuardContext,
  applyGuardResult,
};
