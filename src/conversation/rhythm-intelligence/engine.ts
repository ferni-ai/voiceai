/**
 * Rhythm Intelligence Engine
 *
 * Learn each user's conversational rhythm. Some need quick exchanges,
 * others prefer depth. Adapt response length, pause timing, and pacing.
 *
 * @module @ferni/conversation/rhythm-intelligence/engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  IRhythmIntelligence,
  ConversationalRhythm,
  RhythmGuidance,
  RhythmContext,
  TurnAnalysis,
} from './types.js';
import {
  WORD_RANGES,
  USER_TURN_TO_RESPONSE,
  PAUSE_TIMING,
  EMOTIONAL_PAUSE_ADJUSTMENT,
  THRESHOLDS,
  getTimeOfDay,
  TIME_OF_DAY_ENERGY,
  HIGH_ENERGY_PATTERNS,
  LOW_ENERGY_PATTERNS,
  DEFAULT_RHYTHM_PROFILE,
} from './constants.js';
import { getProfile, createProfile, recordTurn } from './persistence.js';

const log = createLogger({ module: 'RhythmIntelligence' });

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export class RhythmIntelligence implements IRhythmIntelligence {
  /** Session turn counts */
  private sessionTurns = new Map<string, number>();

  // ==========================================================================
  // MAIN METHODS
  // ==========================================================================

  async getGuidance(context: RhythmContext): Promise<RhythmGuidance> {
    const profile = await getProfile(context.userId);

    // Default guidance
    const defaultGuidance: RhythmGuidance = {
      wordRange: WORD_RANGES.moderate,
      pauseBeforeMs: 500,
      useShorterSentences: false,
      energy: 'moderate',
      reason: 'Default rhythm - no profile yet',
      confidence: 0.5,
    };

    // If no profile, use defaults with contextual adjustments
    if (!profile || profile.turnsAnalyzed < THRESHOLDS.minTurnsForProfile) {
      return this.adjustForContext(defaultGuidance, context);
    }

    // Build guidance from profile
    const guidance = this.buildGuidanceFromProfile(profile, context);

    log.debug(
      {
        userId: context.userId,
        wordRange: guidance.wordRange,
        confidence: guidance.confidence,
        reason: guidance.reason,
      },
      'Rhythm guidance generated'
    );

    return guidance;
  }

  async recordTurn(userId: string, analysis: TurnAnalysis, wasSuccessful: boolean): Promise<void> {
    // Ensure time of day is set
    if (!analysis.timeOfDay) {
      analysis.timeOfDay = getTimeOfDay(new Date().getHours());
    }

    analysis.wasSuccessful = wasSuccessful;

    await recordTurn(userId, analysis);

    // Track session turns
    const sessionKey = `${userId}-session`;
    const count = this.sessionTurns.get(sessionKey) || 0;
    this.sessionTurns.set(sessionKey, count + 1);

    log.debug(
      {
        userId,
        wordCount: analysis.wordCount,
        wasSuccessful,
      },
      'Turn recorded for rhythm learning'
    );
  }

  async getProfile(userId: string): Promise<ConversationalRhythm | null> {
    return getProfile(userId);
  }

  analyzeTurn(message: string, options?: { topic?: string }): TurnAnalysis {
    const words = message.split(/\s+/).filter(Boolean);
    const sentences = message.split(/[.!?]+/).filter(Boolean);

    return {
      wordCount: words.length,
      sentenceCount: sentences.length,
      avgWordsPerSentence: sentences.length > 0 ? words.length / sentences.length : words.length,
      energy: this.detectEnergy(message),
      topic: options?.topic,
      timeOfDay: getTimeOfDay(new Date().getHours()),
    };
  }

  buildContextInjection(guidance: RhythmGuidance): string {
    const sections: string[] = ['[RHYTHM GUIDANCE]'];

    sections.push(
      `Target response length: ${guidance.wordRange.min}-${guidance.wordRange.max} words`
    );

    if (guidance.useShorterSentences) {
      sections.push('Use shorter, punchier sentences.');
    }

    if (guidance.energy === 'low') {
      sections.push('Match lower energy. Calm, gentle tone.');
    } else if (guidance.energy === 'high') {
      sections.push('Match higher energy. Enthusiastic where appropriate.');
    }

    sections.push(`Confidence: ${(guidance.confidence * 100).toFixed(0)}%`);
    sections.push(`Reason: ${guidance.reason}`);

    return sections.join('\n');
  }

  reset(): void {
    this.sessionTurns.clear();
    log.debug('Rhythm intelligence reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private buildGuidanceFromProfile(
    profile: ConversationalRhythm,
    context: RhythmContext
  ): RhythmGuidance {
    let wordRange = WORD_RANGES[profile.preferredResponseLength];
    let pauseBeforeMs = PAUSE_TIMING[profile.preferredPace];
    let energy: 'low' | 'moderate' | 'high' = 'moderate';
    let confidence = 0.7;
    const reasons: string[] = [];

    // Check time of day preference
    const timeOfDay = context.timeOfDay || getTimeOfDay(new Date().getHours());
    const timePref = profile.timePatterns[timeOfDay];
    if (timePref.sampleSize >= 5) {
      wordRange = WORD_RANGES[timePref.length];
      energy = timePref.energy;
      reasons.push(`Time-based preference (${timeOfDay})`);
      confidence = Math.min(0.9, confidence + 0.1);
    }

    // Check topic preference
    if (context.topic) {
      const topicPref = profile.topicPreferences.find(
        (p) => p.topic.toLowerCase() === context.topic!.toLowerCase()
      );
      if (topicPref && topicPref.sampleSize >= THRESHOLDS.minTurnsForTopicPref) {
        wordRange = WORD_RANGES[topicPref.preferredLength];
        reasons.push(`Topic preference (${context.topic})`);
        confidence = Math.min(0.9, confidence + 0.1);
      }
    }

    // Adjust based on user's turn length (mirror rhythm)
    if (context.userTurnWordCount) {
      const adjustment = this.getResponseRangeForUserTurn(context.userTurnWordCount);
      if (adjustment) {
        // Blend with profile preference (cast to number type since we're computing)
        wordRange = {
          min: Math.round((wordRange.min + adjustment.min) / 2) as number,
          max: Math.round((wordRange.max + adjustment.max) / 2) as number,
        } as typeof wordRange;
        reasons.push('Mirroring user turn length');
      }
    }

    // Adjust pause for emotional state
    if (context.emotionalState) {
      const pauseAdjust = EMOTIONAL_PAUSE_ADJUSTMENT[context.emotionalState] || 0;
      pauseBeforeMs = Math.max(200, pauseBeforeMs + pauseAdjust) as typeof pauseBeforeMs;
      if (pauseAdjust !== 0) {
        reasons.push(`Emotional adjustment (${context.emotionalState})`);
      }
    }

    // Determine if shorter sentences needed
    const useShorterSentences =
      profile.avgWordsPerTurn < THRESHOLDS.shortTurnWords ||
      context.userTurnWordCount < THRESHOLDS.shortTurnWords;

    if (reasons.length === 0) {
      reasons.push('Using learned profile defaults');
    }

    return {
      wordRange,
      pauseBeforeMs,
      useShorterSentences,
      energy,
      reason: reasons.join('; '),
      confidence,
    };
  }

  private adjustForContext(guidance: RhythmGuidance, context: RhythmContext): RhythmGuidance {
    const adjusted = { ...guidance };
    const reasons: string[] = [];

    // Adjust based on user turn length
    if (context.userTurnWordCount) {
      const range = this.getResponseRangeForUserTurn(context.userTurnWordCount);
      if (range) {
        adjusted.wordRange = range;
        reasons.push('Matching user turn length');
      }
    }

    // Adjust for emotional state
    if (context.emotionalState) {
      const pauseAdjust = EMOTIONAL_PAUSE_ADJUSTMENT[context.emotionalState] || 0;
      adjusted.pauseBeforeMs = Math.max(200, adjusted.pauseBeforeMs + pauseAdjust);
      if (pauseAdjust !== 0) {
        reasons.push(`Emotional context (${context.emotionalState})`);
      }
    }

    // Adjust for time of day
    const timeOfDay = context.timeOfDay || getTimeOfDay(new Date().getHours());
    adjusted.energy = TIME_OF_DAY_ENERGY[timeOfDay];
    if (timeOfDay === 'lateNight') {
      adjusted.wordRange = WORD_RANGES.brief;
      reasons.push('Late night - keeping brief');
    }

    if (reasons.length > 0) {
      adjusted.reason = reasons.join('; ');
    }

    return adjusted;
  }

  private getResponseRangeForUserTurn(wordCount: number): { min: number; max: number } | null {
    if (wordCount < 10) {
      return USER_TURN_TO_RESPONSE.veryShort;
    }
    if (wordCount < 25) {
      return USER_TURN_TO_RESPONSE.short;
    }
    if (wordCount < 50) {
      return USER_TURN_TO_RESPONSE.moderate;
    }
    if (wordCount < 100) {
      return USER_TURN_TO_RESPONSE.detailed;
    }
    return USER_TURN_TO_RESPONSE.lengthy;
  }

  private detectEnergy(message: string): 'low' | 'moderate' | 'high' {
    // Check high energy patterns
    for (const pattern of HIGH_ENERGY_PATTERNS) {
      if (pattern.test(message)) {
        return 'high';
      }
    }

    // Check low energy patterns
    for (const pattern of LOW_ENERGY_PATTERNS) {
      if (pattern.test(message)) {
        return 'low';
      }
    }

    return 'moderate';
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: RhythmIntelligence | null = null;

/**
 * Get singleton instance
 */
export function getRhythmIntelligence(): IRhythmIntelligence {
  if (!instance) {
    instance = new RhythmIntelligence();
  }
  return instance;
}

/**
 * Create new instance (for testing)
 */
export function createRhythmIntelligence(): IRhythmIntelligence {
  return new RhythmIntelligence();
}

/**
 * Reset singleton (for testing)
 */
export function resetRhythmIntelligence(): void {
  instance = null;
}
