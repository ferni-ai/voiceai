/**
 * Response Mode Decision Engine
 *
 * > "Better than human = superhuman perception + human-like restraint"
 *
 * Knows when NOT to respond fully—sometimes presence beats performance.
 *
 * @module @ferni/conversation/response-mode/engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  IResponseModeDecider,
  ResponseMode,
  ResponseModeContext,
  ResponseModeDecision,
  VentingDetectionResult,
  VulnerabilityDetectionResult,
  QuestionDetectionResult,
} from './types.js';
import {
  RESPONSE_MODE_RULES,
  MODE_CONTENT,
  VENTING_PATTERNS,
  VULNERABILITY_PATTERNS,
  QUESTION_PATTERNS,
  THRESHOLDS,
} from './constants.js';

const log = createLogger({ module: 'ResponseModeDecider' });

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export class ResponseModeDecider implements IResponseModeDecider {
  /** Track recent decisions for learning */
  private recentDecisions: Array<{
    mode: ResponseMode;
    outcome?: 'positive' | 'neutral' | 'negative';
    timestamp: number;
  }> = [];

  /** Track mode outcomes for adaptive learning */
  private modeOutcomes: Map<ResponseMode, { positive: number; negative: number }> = new Map();

  constructor() {
    // Initialize outcome tracking
    const modes: ResponseMode[] = [
      'full',
      'brief',
      'presence',
      'silence',
      'clarify',
      'invitation',
      'celebration',
    ];
    modes.forEach((mode) => {
      this.modeOutcomes.set(mode, { positive: 0, negative: 0 });
    });
  }

  // ==========================================================================
  // MAIN DECISION METHOD
  // ==========================================================================

  decide(context: ResponseModeContext): ResponseModeDecision {
    // Sort rules by priority
    const sortedRules = [...RESPONSE_MODE_RULES].sort((a, b) => a.priority - b.priority);

    // Find first matching rule
    for (const rule of sortedRules) {
      if (rule.condition(context)) {
        const decision = this.buildDecision(rule, context);

        // Track decision
        this.recentDecisions.push({
          mode: decision.mode,
          timestamp: Date.now(),
        });

        // Keep only last 10 decisions
        if (this.recentDecisions.length > 10) {
          this.recentDecisions.shift();
        }

        log.debug(
          {
            mode: decision.mode,
            confidence: decision.confidence,
            reasoning: decision.reasoning,
            turnLength: context.userTurnLength,
            wasVenting: context.wasVenting,
            wasVulnerable: context.wasVulnerable,
          },
          'Response mode decided'
        );

        return decision;
      }
    }

    // Default to full response
    return {
      mode: 'full',
      confidence: 0.5,
      reasoning: 'No specific rule matched, defaulting to full response',
    };
  }

  // ==========================================================================
  // CONTENT RETRIEVAL
  // ==========================================================================

  getContentForMode(
    mode: ResponseMode,
    context?: { emotion?: string; topic?: string }
  ): { text: string; ssml: string } | null {
    // Silence mode returns null
    if (mode === 'silence') return null;

    // Full mode returns null - caller generates full response
    if (mode === 'full') return null;

    const phrases = MODE_CONTENT[mode];
    if (!phrases || phrases.length === 0) return null;

    // Select phrase (could be smarter with context, but random for now)
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    // Strip SSML for text version
    const text = phrase.replace(/<[^>]+>/g, '').trim();

    return { text, ssml: phrase };
  }

  // ==========================================================================
  // DETECTION METHODS
  // ==========================================================================

  detectVenting(message: string, intensity: number): VentingDetectionResult {
    const signals: string[] = [];
    let isVenting = false;

    // Check high-intensity patterns
    for (const pattern of VENTING_PATTERNS.highIntensity) {
      if (pattern.test(message)) {
        signals.push('high_intensity_language');
        isVenting = true;
        break;
      }
    }

    // Check moderate-intensity patterns
    if (!isVenting) {
      for (const pattern of VENTING_PATTERNS.moderateIntensity) {
        if (pattern.test(message)) {
          signals.push('moderate_intensity_language');
          isVenting = true;
          break;
        }
      }
    }

    // Check message length
    const wordCount = message.split(/\s+/).length;
    if (wordCount >= VENTING_PATTERNS.minLengthForVenting) {
      signals.push('long_message');
      // Long messages with any intensity are likely venting
      if (intensity > 0.3) {
        isVenting = true;
      }
    }

    // High intensity alone suggests venting
    if (intensity >= THRESHOLDS.highIntensityVenting) {
      signals.push('high_emotional_intensity');
      isVenting = true;
    }

    return {
      isVenting,
      intensity: isVenting ? Math.max(intensity, 0.5) : intensity,
      signals,
    };
  }

  detectVulnerability(message: string): VulnerabilityDetectionResult {
    const markers: string[] = [];
    let level: 'low' | 'medium' | 'high' = 'low';

    // Check high vulnerability patterns
    for (const pattern of VULNERABILITY_PATTERNS.high) {
      if (pattern.test(message)) {
        markers.push('high_vulnerability_marker');
        level = 'high';
        break;
      }
    }

    // Check medium vulnerability patterns
    if (level !== 'high') {
      for (const pattern of VULNERABILITY_PATTERNS.medium) {
        if (pattern.test(message)) {
          markers.push('medium_vulnerability_marker');
          level = 'medium';
          break;
        }
      }
    }

    // Check low vulnerability patterns
    if (level === 'low') {
      for (const pattern of VULNERABILITY_PATTERNS.low) {
        if (pattern.test(message)) {
          markers.push('low_vulnerability_marker');
          break;
        }
      }
    }

    return {
      isVulnerable: level !== 'low' || markers.length > 0,
      level,
      markers,
    };
  }

  detectQuestion(message: string): QuestionDetectionResult {
    // Check for rhetorical questions first (don't need answer)
    for (const pattern of QUESTION_PATTERNS.rhetorical) {
      if (pattern.test(message)) {
        return {
          hasQuestion: false, // Rhetorical doesn't need response
          questionType: 'rhetorical',
        };
      }
    }

    // Check for direct questions
    for (const pattern of QUESTION_PATTERNS.direct) {
      if (pattern.test(message)) {
        return {
          hasQuestion: true,
          questionType: 'direct',
        };
      }
    }

    // Check for indirect questions
    for (const pattern of QUESTION_PATTERNS.indirect) {
      if (pattern.test(message)) {
        return {
          hasQuestion: true,
          questionType: 'indirect',
        };
      }
    }

    return {
      hasQuestion: false,
      questionType: 'none',
    };
  }

  // ==========================================================================
  // LEARNING & TRACKING
  // ==========================================================================

  recordOutcome(mode: ResponseMode, userReaction: 'positive' | 'neutral' | 'negative'): void {
    // Find most recent decision with this mode
    const decision = [...this.recentDecisions].reverse().find((d) => d.mode === mode && !d.outcome);

    if (decision) {
      decision.outcome = userReaction;
    }

    // Update outcome tracking
    const outcomes = this.modeOutcomes.get(mode);
    if (outcomes) {
      if (userReaction === 'positive') {
        outcomes.positive++;
      } else if (userReaction === 'negative') {
        outcomes.negative++;
      }
    }

    log.debug({ mode, reaction: userReaction }, 'Response mode outcome recorded');
  }

  reset(): void {
    this.recentDecisions = [];
    // Don't reset outcome tracking - that's long-term learning
    log.debug('Response mode decider reset for new session');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private buildDecision(
    rule: (typeof RESPONSE_MODE_RULES)[0],
    context: ResponseModeContext
  ): ResponseModeDecision {
    // Calculate confidence based on rule match and historical outcomes
    let confidence = 0.8; // Base confidence for rule match

    // Adjust based on historical outcomes
    const outcomes = this.modeOutcomes.get(rule.mode);
    if (outcomes) {
      const total = outcomes.positive + outcomes.negative;
      if (total > 5) {
        const successRate = outcomes.positive / total;
        confidence = 0.5 + successRate * 0.4; // 0.5-0.9 based on success rate
      }
    }

    // Select phrase
    let suggestedPhrase: string | undefined;
    let suggestedSsml: string | undefined;

    if (rule.suggestedPhrases && rule.suggestedPhrases.length > 0) {
      suggestedSsml =
        rule.suggestedPhrases[Math.floor(Math.random() * rule.suggestedPhrases.length)];
      suggestedPhrase = suggestedSsml.replace(/<[^>]+>/g, '').trim();
    }

    // Build reasoning
    const reasoning = this.buildReasoning(rule, context);

    return {
      mode: rule.mode,
      confidence,
      reasoning,
      maxWords: rule.maxWords,
      suggestedPhrase,
      suggestedSsml,
      pauseBeforeMs: rule.pauseBeforeMs,
    };
  }

  private buildReasoning(
    rule: (typeof RESPONSE_MODE_RULES)[0],
    context: ResponseModeContext
  ): string {
    const reasons: string[] = [];

    if (context.wasVenting) {
      reasons.push(`user was venting (intensity: ${context.userTurnIntensity.toFixed(2)})`);
    }
    if (context.wasVulnerable) {
      reasons.push('user shared something vulnerable');
    }
    if (context.askedQuestion) {
      reasons.push('user asked a question');
    }
    if (context.sentiment === 'positive' && context.userTurnIntensity > 0.6) {
      reasons.push('positive moment with high energy');
    }
    if (context.userTurnLength < THRESHOLDS.shortTurnWords) {
      reasons.push(`short turn (${context.userTurnLength} words)`);
    }
    if (context.trajectory === 'declining') {
      reasons.push('emotional trajectory declining');
    }

    if (reasons.length === 0) {
      return `Selected ${rule.mode} mode based on rule priority ${rule.priority}`;
    }

    return `Selected ${rule.mode} mode because: ${reasons.join(', ')}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: ResponseModeDecider | null = null;

/**
 * Get singleton instance of ResponseModeDecider
 */
export function getResponseModeDecider(): IResponseModeDecider {
  if (!instance) {
    instance = new ResponseModeDecider();
  }
  return instance;
}

/**
 * Create new instance (for testing)
 */
export function createResponseModeDecider(): IResponseModeDecider {
  return new ResponseModeDecider();
}

/**
 * Reset singleton (for testing)
 */
export function resetResponseModeDecider(): void {
  instance = null;
}
