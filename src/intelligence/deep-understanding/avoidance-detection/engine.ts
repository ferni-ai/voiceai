/**
 * Avoidance Pattern Detection Engine
 *
 * Detect when users consistently avoid certain topics. Not to push—to understand.
 *
 * @module @ferni/intelligence/deep-understanding/avoidance-detection/engine
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  IAvoidanceDetector,
  AvoidanceSignal,
  AvoidancePattern,
  AvoidanceAnalysis,
  AvoidanceContext,
  AvoidanceApproach,
  AvoidanceSignalType,
} from './types.js';
import {
  AVOIDANCE_RULES,
  THRESHOLDS,
  getGentleInquiry,
} from './detection-rules.js';
import {
  saveSignal,
  getPatterns,
  getStrongPatterns,
  getPatternsByTopics,
  acknowledgePattern,
} from './persistence.js';

const log = createLogger({ module: 'AvoidanceDetector' });

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export class AvoidanceDetector implements IAvoidanceDetector {
  /** Track signals in current session */
  private sessionSignals: Map<string, AvoidanceSignal[]> = new Map();

  // ==========================================================================
  // MAIN DETECTION
  // ==========================================================================

  async detect(context: AvoidanceContext): Promise<AvoidanceAnalysis> {
    const signals: AvoidanceSignal[] = [];
    const { message, previousTopic, userId, sessionId, turnNumber } = context;

    // Check each rule
    for (const rule of AVOIDANCE_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(message)) {
          // Determine avoided topic
          const avoidedTopic = this.determineAvoidedTopic(context, rule.type);

          const signal: AvoidanceSignal = {
            type: rule.type,
            trigger: message.match(pattern)?.[0] || '',
            confidence: rule.baseConfidence,
            avoidedTopic,
            shiftedToTopic: rule.type === 'topic_change' ? this.extractNewTopic(message) : undefined,
            timestamp: new Date(),
            turnNumber,
            sessionId,
          };

          // Boost confidence based on context
          signal.confidence = this.adjustConfidence(signal, context);

          if (signal.confidence >= THRESHOLDS.minConfidence) {
            signals.push(signal);

            // Save signal
            await saveSignal(userId, signal);

            // Track in session
            const sessionSignals = this.sessionSignals.get(sessionId) || [];
            sessionSignals.push(signal);
            this.sessionSignals.set(sessionId, sessionSignals);
          }

          break; // One match per rule is enough
        }
      }
    }

    // Get related patterns
    const relatedTopics = signals.map((s) => s.avoidedTopic);
    const relatedPatterns =
      relatedTopics.length > 0
        ? await getPatternsByTopics(userId, relatedTopics)
        : [];

    // Check if this is a repeat
    const isRepeat = relatedPatterns.some(
      (p) => p.frequency >= THRESHOLDS.minSignalsForPattern
    );

    // Determine approach
    const suggestedApproach = this.determinApproach(signals, relatedPatterns);

    const analysis: AvoidanceAnalysis = {
      signals,
      hasAvoidance: signals.length > 0,
      primarySignal: signals.length > 0 ? signals[0] : undefined,
      relatedPatterns,
      isRepeat,
      suggestedApproach,
    };

    if (signals.length > 0) {
      log.debug(
        {
          signalCount: signals.length,
          primaryType: analysis.primarySignal?.type,
          isRepeat,
          approach: suggestedApproach.action,
        },
        'Avoidance detected'
      );
    }

    return analysis;
  }

  // ==========================================================================
  // PATTERN ACCESS
  // ==========================================================================

  async getPatterns(userId: string): Promise<AvoidancePattern[]> {
    return getPatterns(userId);
  }

  async getStrongPatterns(
    userId: string,
    threshold: number = THRESHOLDS.strongPatternThreshold
  ): Promise<AvoidancePattern[]> {
    return getStrongPatterns(userId, threshold);
  }

  async acknowledgePattern(userId: string, topic: string): Promise<void> {
    await acknowledgePattern(userId, topic);
  }

  // ==========================================================================
  // CONTEXT INJECTION
  // ==========================================================================

  buildContextInjection(analysis: AvoidanceAnalysis): string {
    if (!analysis.hasAvoidance) return '';

    const sections: string[] = ['[AVOIDANCE PATTERN DETECTED]'];

    const signal = analysis.primarySignal!;
    const descriptions: Record<AvoidanceSignalType, string> = {
      topic_change: 'User changed topic abruptly. Dont push, but note it.',
      vague_response: 'User gave vague response. Something may be hard to express.',
      deflection: 'User deflected. They may not be ready to explore this.',
      minimization: 'User minimized. The topic may be more significant than they say.',
      humor_shield: 'User used humor. May be protecting from something deeper.',
      generalization: 'User generalized. Personal specifics may be difficult.',
      time_pressure: 'User cited time. This topic may feel overwhelming.',
    };

    sections.push(descriptions[signal.type]);
    sections.push(`Topic avoided: ${signal.avoidedTopic}`);

    if (analysis.isRepeat) {
      sections.push('NOTE: This is a REPEATED avoidance pattern. Tread gently.');
    }

    if (analysis.suggestedApproach.action === 'gentle-inquiry') {
      sections.push(`Suggested approach: ${analysis.suggestedApproach.suggestedWording}`);
    } else if (analysis.suggestedApproach.action === 'honor-boundary') {
      sections.push('Respect this boundary. Do NOT push on this topic.');
    }

    return sections.join('\n');
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  reset(): void {
    this.sessionSignals.clear();
    log.debug('Avoidance detector reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private determineAvoidedTopic(
    context: AvoidanceContext,
    signalType: AvoidanceSignalType
  ): string {
    // If previous topic exists, that's what they're avoiding
    if (context.previousTopic) {
      return context.previousTopic;
    }

    // Try to extract from previous message
    if (context.previousMessage) {
      // Simple topic extraction - in production, use NLP
      const topics = ['work', 'family', 'relationship', 'health', 'money', 'feelings'];
      const messageLower = context.previousMessage.toLowerCase();
      for (const topic of topics) {
        if (messageLower.includes(topic)) {
          return topic;
        }
      }
    }

    return 'previous topic';
  }

  private extractNewTopic(message: string): string {
    // Simple extraction - in production, use NLP
    const topicMatchers = [
      { pattern: /let('s| us) talk about (\w+)/i, group: 2 },
      { pattern: /what about (\w+)/i, group: 1 },
      { pattern: /speaking of (\w+)/i, group: 1 },
    ];

    for (const matcher of topicMatchers) {
      const match = message.match(matcher.pattern);
      if (match) {
        return match[matcher.group];
      }
    }

    return 'new topic';
  }

  private adjustConfidence(
    signal: AvoidanceSignal,
    context: AvoidanceContext
  ): number {
    let confidence = signal.confidence;

    // Boost if this is early in conversation (more likely genuine avoidance)
    if (context.turnNumber <= 3) {
      confidence += 0.1;
    }

    // Boost if multiple signals in session
    const sessionSignals = this.sessionSignals.get(context.sessionId) || [];
    const sameTopicSignals = sessionSignals.filter(
      (s) => s.avoidedTopic === signal.avoidedTopic
    );
    if (sameTopicSignals.length > 0) {
      confidence += 0.1 * sameTopicSignals.length;
    }

    // Cap at 0.95
    return Math.min(0.95, confidence);
  }

  private determinApproach(
    signals: AvoidanceSignal[],
    patterns: AvoidancePattern[]
  ): AvoidanceApproach {
    if (signals.length === 0) {
      return {
        action: 'ignore',
        reason: 'No avoidance detected',
      };
    }

    const primarySignal = signals[0];
    const relatedPattern = patterns.find(
      (p) => p.topic.toLowerCase() === primarySignal.avoidedTopic.toLowerCase()
    );

    // Strong, unacknowledged pattern - time to gently address
    if (
      relatedPattern &&
      relatedPattern.strength >= THRESHOLDS.strongPatternThreshold &&
      !relatedPattern.acknowledged &&
      relatedPattern.sessionIds.length >= THRESHOLDS.minSessionsForPattern
    ) {
      return {
        action: 'gentle-inquiry',
        reason: `Strong pattern detected across ${relatedPattern.sessionIds.length} sessions`,
        suggestedWording: getGentleInquiry(primarySignal.type),
        avoidTopics: [primarySignal.avoidedTopic],
      };
    }

    // Already acknowledged - honor boundary
    if (relatedPattern?.acknowledged) {
      return {
        action: 'honor-boundary',
        reason: 'User has been made aware; they choose to avoid',
        avoidTopics: [primarySignal.avoidedTopic],
      };
    }

    // Building pattern - note but don't push
    if (relatedPattern && relatedPattern.frequency >= 2) {
      return {
        action: 'note',
        reason: 'Pattern developing; not strong enough to address yet',
      };
    }

    // First occurrence - just note
    return {
      action: 'note',
      reason: 'First occurrence; tracking pattern',
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: AvoidanceDetector | null = null;

/**
 * Get singleton instance
 */
export function getAvoidanceDetector(): IAvoidanceDetector {
  if (!instance) {
    instance = new AvoidanceDetector();
  }
  return instance;
}

/**
 * Create new instance (for testing)
 */
export function createAvoidanceDetector(): IAvoidanceDetector {
  return new AvoidanceDetector();
}

/**
 * Reset singleton (for testing)
 */
export function resetAvoidanceDetector(): void {
  instance = null;
}
