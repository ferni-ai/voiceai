/**
 * Micro-Moment Detection Engine
 *
 * Catch the small moments humans miss. The micro-shifts that signal growth,
 * vulnerability, or change. These moments deserve acknowledgment.
 *
 * @module @ferni/intelligence/deep-understanding/micro-moments/engine
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  IMicroMomentDetector,
  MicroMoment,
  MicroMomentAnalysis,
  MicroMomentContext,
  MicroMomentAcknowledgment,
  MicroMomentType,
} from './types.js';
import {
  MICRO_MOMENT_RULES,
  getRandomPhrase,
  getRandomSsml,
  getRuleForType,
} from './detection-rules.js';

const log = createLogger({ module: 'MicroMomentDetector' });

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export class MicroMomentDetector implements IMicroMomentDetector {
  /** Track detected moments for learning */
  private recentMoments: MicroMoment[] = [];

  /** Track outcomes for effectiveness learning */
  private outcomes: Map<MicroMomentType, { positive: number; negative: number; neutral: number }> =
    new Map();

  constructor() {
    // Initialize outcome tracking
    const types: MicroMomentType[] = [
      'vulnerability-edge',
      'small-win',
      'relationship-shift',
      'language-change',
      'hope-glimmer',
      'self-compassion',
      'boundary-attempt',
      'growth-evidence',
    ];
    for (const type of types) {
      this.outcomes.set(type, { positive: 0, negative: 0, neutral: 0 });
    }
  }

  // ==========================================================================
  // MAIN DETECTION
  // ==========================================================================

  detect(context: MicroMomentContext): MicroMomentAnalysis {
    const moments: MicroMoment[] = [];
    const { message } = context;

    // Check each rule
    for (const rule of MICRO_MOMENT_RULES) {
      const detection = this.checkRule(rule, message, context);
      if (detection) {
        moments.push(detection);
      }
    }

    // Check for language change (requires context comparison)
    if (context.previousMessages && context.languageBaseline) {
      const languageShift = this.detectLanguageShift(context);
      if (languageShift) {
        moments.push(languageShift);
      }
    }

    // Sort by confidence
    moments.sort((a, b) => b.confidence - a.confidence);

    // Track
    this.recentMoments.push(...moments);
    if (this.recentMoments.length > 50) {
      this.recentMoments = this.recentMoments.slice(-50);
    }

    const primaryMoment = moments.length > 0 ? moments[0] : undefined;

    const analysis: MicroMomentAnalysis = {
      moments,
      hasSignificantMoment: moments.some((m) => m.confidence > 0.7),
      primaryMoment,
      summary: this.buildSummary(moments),
    };

    if (moments.length > 0) {
      log.debug(
        {
          momentCount: moments.length,
          primaryType: primaryMoment?.type,
          primaryConfidence: primaryMoment?.confidence,
        },
        'Micro-moments detected'
      );
    }

    return analysis;
  }

  // ==========================================================================
  // ACKNOWLEDGMENT
  // ==========================================================================

  getAcknowledgment(moment: MicroMoment): MicroMomentAcknowledgment {
    const rule = getRuleForType(moment.type);
    if (!rule) {
      return {
        type: 'verbal',
        phrase: 'I noticed that.',
        ssml: 'I noticed that.',
        timing: 'weave-in',
        pauseBeforeMs: 200,
      };
    }

    return {
      type: rule.defaultAcknowledgment,
      phrase: getRandomPhrase(moment.type),
      ssml: getRandomSsml(moment.type),
      timing: rule.defaultTiming,
      pauseBeforeMs: rule.defaultPauseMs,
    };
  }

  // ==========================================================================
  // CONTEXT INJECTION
  // ==========================================================================

  buildContextInjection(analysis: MicroMomentAnalysis): string {
    if (!analysis.hasSignificantMoment || !analysis.primaryMoment) {
      return '';
    }

    const sections: string[] = ['[MICRO-MOMENT DETECTED]'];

    const moment = analysis.primaryMoment;
    const typeDescriptions: Record<MicroMomentType, string> = {
      'vulnerability-edge':
        'User is sharing something vulnerable. Honor this with gentle presence. Dont overreact.',
      'small-win': 'User achieved something they find meaningful. Celebrate it without minimizing.',
      'relationship-shift':
        "User's perspective on a relationship is changing. Reflect this gently.",
      'language-change': 'User shifted from "I" to "we" language. They\'re feeling connected.',
      'hope-glimmer': 'A spark of hope appeared. Nurture it without pressure.',
      'self-compassion': 'User is being kind to themselves. This is growth. Affirm it.',
      'boundary-attempt': 'User set or tried to set a boundary. Validate their strength.',
      'growth-evidence': 'User recognized their own growth. Mirror it back to them.',
    };

    sections.push(typeDescriptions[moment.type]);
    sections.push(`Trigger: "${moment.trigger}"`);
    sections.push(`Confidence: ${(moment.confidence * 100).toFixed(0)}%`);

    if (moment.acknowledgment.timing === 'immediate') {
      sections.push(`Suggested response: "${moment.acknowledgment.phrase}"`);
    } else {
      sections.push(
        `Weave this acknowledgment naturally into your response: "${moment.acknowledgment.phrase}"`
      );
    }

    return sections.join('\n');
  }

  // ==========================================================================
  // LEARNING
  // ==========================================================================

  recordOutcome(moment: MicroMoment, userReaction: 'positive' | 'neutral' | 'negative'): void {
    const outcomes = this.outcomes.get(moment.type);
    if (outcomes) {
      outcomes[userReaction]++;
    }

    log.debug({ type: moment.type, reaction: userReaction }, 'Micro-moment outcome recorded');
  }

  reset(): void {
    this.recentMoments = [];
    log.debug('Micro-moment detector reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private checkRule(
    rule: (typeof MICRO_MOMENT_RULES)[0],
    message: string,
    context: MicroMomentContext
  ): MicroMoment | null {
    let confidence = 0;
    let matchedPattern: string | null = null;
    let matchPosition: 'start' | 'middle' | 'end' = 'middle';

    // Check patterns
    for (const pattern of rule.patterns) {
      const match = message.match(pattern);
      if (match) {
        confidence += rule.baseConfidence;
        matchedPattern = match[0];

        // Determine position
        const matchStart = match.index || 0;
        const messageLength = message.length;
        if (matchStart < messageLength * 0.2) {
          matchPosition = 'start';
        } else if (matchStart > messageLength * 0.8) {
          matchPosition = 'end';
        }
        break;
      }
    }

    if (!matchedPattern) return null;

    // Boost for keywords
    const messageLower = message.toLowerCase();
    for (const keyword of rule.keywords) {
      if (messageLower.includes(keyword.toLowerCase())) {
        confidence = Math.min(0.95, confidence + 0.05);
      }
    }

    // Boost for emotional context
    if (
      context.emotionalState &&
      ['sad', 'vulnerable', 'hopeful', 'proud'].includes(context.emotionalState)
    ) {
      confidence = Math.min(0.95, confidence + 0.05);
    }

    // Apply learned adjustments
    const outcomes = this.outcomes.get(rule.type);
    if (outcomes) {
      const total = outcomes.positive + outcomes.negative + outcomes.neutral;
      if (total > 5) {
        const positiveRate = outcomes.positive / total;
        // Adjust confidence based on historical success
        if (positiveRate > 0.7) {
          confidence = Math.min(0.95, confidence + 0.1);
        } else if (positiveRate < 0.3) {
          confidence = Math.max(0.3, confidence - 0.1);
        }
      }
    }

    // Build acknowledgment
    const acknowledgment: MicroMomentAcknowledgment = {
      type: rule.defaultAcknowledgment,
      phrase: getRandomPhrase(rule.type),
      ssml: getRandomSsml(rule.type),
      timing: rule.defaultTiming,
      pauseBeforeMs: rule.defaultPauseMs,
    };

    return {
      type: rule.type,
      trigger: matchedPattern,
      confidence,
      position: matchPosition,
      acknowledgment,
      context: {
        topic: context.topic,
        entities: this.extractEntities(message),
      },
      timestamp: new Date(),
    };
  }

  private detectLanguageShift(context: MicroMomentContext): MicroMoment | null {
    if (!context.languageBaseline || !context.previousMessages) {
      return null;
    }

    const message = context.message.toLowerCase();
    const weCount = (message.match(/\bwe\b/g) || []).length;
    const iCount = (message.match(/\bi\b/g) || []).length;

    const totalPronouns = weCount + iCount;
    if (totalPronouns === 0) return null;

    const weRatio = weCount / totalPronouns;
    const baselineWeRatio = context.languageBaseline.usesWeFrequency;

    // Significant increase in "we" usage
    if (weRatio > baselineWeRatio + 0.3 && weCount >= 2) {
      return {
        type: 'language-change',
        trigger: 'Increased "we" language detected',
        confidence: 0.7,
        position: 'middle',
        acknowledgment: {
          type: 'gentle-mirror',
          phrase: getRandomPhrase('language-change'),
          ssml: getRandomSsml('language-change'),
          timing: 'weave-in',
          pauseBeforeMs: 200,
        },
        context: {
          previousPattern: `${(baselineWeRatio * 100).toFixed(0)}% "we" usage`,
          currentPattern: `${(weRatio * 100).toFixed(0)}% "we" usage`,
          topic: context.topic,
        },
        timestamp: new Date(),
      };
    }

    return null;
  }

  private extractEntities(message: string): string[] {
    const entities: string[] = [];

    // Simple named entity extraction
    // Look for capitalized words that aren't at sentence start
    const words = message.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const word = words[i].replace(/[.,!?]$/, '');
      if (
        word.length > 1 &&
        word[0] === word[0].toUpperCase() &&
        word[0] !== word[0].toLowerCase()
      ) {
        entities.push(word);
      }
    }

    return [...new Set(entities)];
  }

  private buildSummary(moments: MicroMoment[]): string {
    if (moments.length === 0) {
      return 'No significant micro-moments detected.';
    }

    const typeNames: Record<MicroMomentType, string> = {
      'vulnerability-edge': 'vulnerability',
      'small-win': 'small win',
      'relationship-shift': 'relationship shift',
      'language-change': 'language change',
      'hope-glimmer': 'hope',
      'self-compassion': 'self-compassion',
      'boundary-attempt': 'boundary setting',
      'growth-evidence': 'growth',
    };

    const types = moments.map((m) => typeNames[m.type]);
    const unique = [...new Set(types)];

    if (unique.length === 1) {
      return `Detected ${unique[0]} moment.`;
    }

    return `Detected ${unique.join(', ')} moments.`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: MicroMomentDetector | null = null;

/**
 * Get singleton instance
 */
export function getMicroMomentDetector(): IMicroMomentDetector {
  if (!instance) {
    instance = new MicroMomentDetector();
  }
  return instance;
}

/**
 * Create new instance (for testing)
 */
export function createMicroMomentDetector(): IMicroMomentDetector {
  return new MicroMomentDetector();
}

/**
 * Reset singleton (for testing)
 */
export function resetMicroMomentDetector(): void {
  instance = null;
}
