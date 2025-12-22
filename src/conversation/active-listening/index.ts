/**
 * Active Listening Module
 *
 * Implements sophisticated active listening behaviors:
 * - Rich, context-aware backchanneling
 * - Vocabulary mirroring
 * - Emotional echoing
 * - Clarifying questions
 * - Comfortable silence handling
 *
 * @module conversation/active-listening
 */

import {
  generateContent,
  getContentWithFallback,
  type ContentContext,
} from '../../services/llm-dynamic-content.js';
import { getLogger } from '../../utils/safe-logger.js';
import { seededChance, seededIndex } from '../utils/rng.js';

import {
  BACKCHANNELS,
  FERNI_SILENCE_BACKCHANNEL,
  NAYAN_SILENCE_BACKCHANNEL,
  PERSONA_BACKCHANNEL_STYLES,
  SAD_SILENCE_BACKCHANNELS,
  SILENCE_BACKCHANNELS,
} from './backchannels.js';
import { generateClarifyingQuestion } from './clarification.js';
import {
  extractNotableWords,
  generateEmotionalEcho,
  mirrorUserVocabulary,
} from './mirroring.js';
import { evaluateSilence, getGentlePrompt } from './silence-handling.js';
import type {
  Backchannel,
  BackchannelContext,
  ClarifyingQuestion,
  MirroredPhrase,
  SilenceBackchannelContext,
} from './types.js';

// Re-export types
export type {
  Backchannel,
  BackchannelContext,
  ClarifyingQuestion,
  MirroredPhrase,
  SilenceBackchannelContext,
  SilenceEvaluation,
} from './types.js';

const log = getLogger();

// ============================================================================
// ACTIVE LISTENING ENGINE
// ============================================================================

export class ActiveListeningEngine {
  private recentBackchannels: string[] = [];
  private lastBackchannelTime = 0;
  private extractedUserVocabulary = new Set<string>();

  // Dynamic backchannel frequency based on user patterns
  private userBackchannelPreference: 'frequent' | 'moderate' | 'minimal' = 'moderate';
  private totalBackchannels = 0;
  private positiveReactions = 0;

  constructor() {
    log.debug('ActiveListeningEngine initialized');
  }

  /**
   * Record user reaction to backchannel for frequency tuning
   */
  recordBackchannelReaction(wasPositive: boolean): void {
    this.totalBackchannels++;
    if (wasPositive) {
      this.positiveReactions++;
    }

    if (this.totalBackchannels >= 5) {
      const positiveRate = this.positiveReactions / this.totalBackchannels;
      if (positiveRate > 0.7) {
        this.userBackchannelPreference = 'frequent';
      } else if (positiveRate < 0.3) {
        this.userBackchannelPreference = 'minimal';
      } else {
        this.userBackchannelPreference = 'moderate';
      }

      log.debug(
        {
          preference: this.userBackchannelPreference,
          positiveRate,
          totalBackchannels: this.totalBackchannels,
        },
        'Updated backchannel frequency preference'
      );
    }
  }

  /**
   * Get recommended wait time before next backchannel
   */
  getBackchannelCooldownMs(): number {
    switch (this.userBackchannelPreference) {
      case 'frequent':
        return 2000;
      case 'moderate':
        return 3500;
      case 'minimal':
        return 6000;
    }
  }

  /**
   * Get an appropriate backchannel for the context
   */
  getBackchannel(personaId: string, context: BackchannelContext): Backchannel | null {
    const cooldownMs = this.getBackchannelCooldownMs();
    if (Date.now() - this.lastBackchannelTime < cooldownMs) {
      return null;
    }

    const seedBase = context.randomSeed ?? this.buildSeedBase(personaId, context);

    if (
      this.userBackchannelPreference === 'minimal' &&
      seededChance(`${seedBase}:minimal-skip`, 0.5)
    ) {
      return null;
    }

    const type = this.selectBackchannelType(context);

    // Try LLM-generated backchannel
    const llmContext: ContentContext = {
      contentType: 'active_listening',
      personaId,
      emotion: context.userEmotion,
      topic: context.topicSeriousness || 'casual',
      metadata: {
        userEnergy: context.userEnergy,
        isPersonalSharing: context.userJustSharedSomethingPersonal,
        isQuestion: context.userAskedQuestion,
        backchannelType: type,
      },
    };

    const llmContent = getContentWithFallback(llmContext);
    if (llmContent.source === 'llm' && llmContent.content) {
      const verbal = llmContent.content;
      if (!this.recentBackchannels.includes(verbal)) {
        this.recordBackchannel(verbal);
        log.debug({ source: 'llm', type }, '👂 Using LLM-generated backchannel');
        return {
          verbal,
          ssml: llmContent.ssml || `<volume ratio="0.85"/>${verbal}`,
          type,
          energy: context.userEnergy || 'low',
        };
      }
    }

    // Try persona-specific phrase
    const style = PERSONA_BACKCHANNEL_STYLES[personaId];
    if (style && seededChance(`${seedBase}:persona-unique`, 0.2)) {
      const uniqueOfType = style.uniquePhrases.filter((p) => p.type === type);
      if (uniqueOfType.length > 0) {
        const phrase =
          uniqueOfType[seededIndex(`${seedBase}:unique:${type}`, uniqueOfType.length)] ??
          uniqueOfType[0];
        this.recordBackchannel(phrase.phrase);
        return {
          verbal: phrase.phrase,
          ssml: phrase.ssml,
          type: phrase.type,
          energy: style.energyBias,
        };
      }
    }

    // Get from general library
    const candidates = BACKCHANNELS[type];
    const available = candidates.filter((b) => {
      if (context.topicSeriousness === 'serious' && b.energy === 'high') return false;
      if (context.topicSeriousness === 'emotional' && b.energy === 'high') return false;
      if (context.userEnergy === 'low' && b.energy === 'high') return false;
      if (this.recentBackchannels.includes(b.verbal)) return false;
      return true;
    });

    if (available.length === 0) {
      this.recentBackchannels = [];
      return null;
    }

    const selected =
      available[seededIndex(`${seedBase}:pick:${type}`, available.length)] ?? available[0];
    this.recordBackchannel(selected.verbal);

    return { ...selected, type };
  }

  /**
   * Get a backchannel asynchronously with fresh LLM generation
   */
  async getBackchannelAsync(
    personaId: string,
    context: BackchannelContext
  ): Promise<Backchannel | null> {
    const cooldownMs = this.getBackchannelCooldownMs();
    if (Date.now() - this.lastBackchannelTime < cooldownMs) {
      return null;
    }

    const type = this.selectBackchannelType(context);

    const llmContext: ContentContext = {
      contentType: 'active_listening',
      personaId,
      emotion: context.userEmotion,
      topic: context.topicSeriousness || 'casual',
      metadata: {
        userEnergy: context.userEnergy,
        isPersonalSharing: context.userJustSharedSomethingPersonal,
        isQuestion: context.userAskedQuestion,
        backchannelType: type,
      },
    };

    const llmContent = await generateContent(llmContext);
    if (llmContent && llmContent.content) {
      const verbal = llmContent.content;
      this.recordBackchannel(verbal);
      log.debug({ source: 'llm-async', type }, '👂 Generated async LLM backchannel');
      return {
        verbal,
        ssml: llmContent.ssml || `<volume ratio="0.85"/>${verbal}`,
        type,
        energy: context.userEnergy || 'low',
      };
    }

    return this.getBackchannel(personaId, context);
  }

  /**
   * Generate a mirrored phrase that echoes the user's vocabulary
   */
  mirrorUserVocabulary(userText: string, responseText: string): MirroredPhrase | null {
    return mirrorUserVocabulary(userText, responseText, this.extractedUserVocabulary);
  }

  /**
   * Generate an emotional echo phrase
   */
  generateEmotionalEcho(
    userEmotion: string,
    userText: string,
    intensity: 'low' | 'medium' | 'high' = 'medium'
  ): string {
    return generateEmotionalEcho(userEmotion, userText, intensity);
  }

  /**
   * Generate a clarifying question
   */
  generateClarifyingQuestion(
    type: ClarifyingQuestion['type'],
    context?: { topic?: string; previousStatement?: string }
  ): ClarifyingQuestion {
    return generateClarifyingQuestion(type, context);
  }

  /**
   * Evaluate if silence is comfortable in this context
   */
  evaluateSilence(
    silenceDurationMs: number,
    context: {
      userJustSharedPersonal?: boolean;
      userIsThinking?: boolean;
      emotionalIntensity?: 'high' | 'medium' | 'low';
    }
  ) {
    return evaluateSilence(silenceDurationMs, context);
  }

  /**
   * Get a gentle prompt for re-engaging after silence
   */
  getGentlePrompt(context?: { lastTopic?: string; userEmotion?: string }): string {
    return getGentlePrompt(context);
  }

  /**
   * Get a silence-aware backchannel
   */
  getSilenceBackchannel(
    personaId: string,
    context: SilenceBackchannelContext
  ): Backchannel | null {
    const evaluation = evaluateSilence(context.silenceDurationMs, {
      userJustSharedPersonal: context.userJustSharedPersonal,
      emotionalIntensity: context.userIsProcessingEmotions ? 'high' : 'medium',
    });

    if (evaluation.comfortable && evaluation.action === 'wait') {
      return null;
    }

    if (Date.now() - this.lastBackchannelTime < 5000) {
      return null;
    }

    if ((context.turnCount || 0) < 2) {
      return null;
    }

    let silenceBackchannels = [...SILENCE_BACKCHANNELS];

    if (context.lastUserEmotion === 'sad' || context.lastUserEmotion === 'overwhelmed') {
      silenceBackchannels.push(...SAD_SILENCE_BACKCHANNELS);
    }

    if (personaId === 'ferni') {
      silenceBackchannels.push(FERNI_SILENCE_BACKCHANNEL);
    }
    if (personaId === 'nayan-patel') {
      silenceBackchannels.push(NAYAN_SILENCE_BACKCHANNEL);
    }

    const available = silenceBackchannels.filter(
      (b) => !this.recentBackchannels.includes(b.verbal)
    );
    if (available.length === 0) {
      return null;
    }

    const seed =
      context.randomSeed ??
      `silence-backchannel:${personaId}:${context.turnCount ?? 0}:${context.silenceDurationMs}:${context.lastUserEmotion ?? ''}`;
    const selected = available[seededIndex(seed, available.length)] ?? available[0];
    this.recordBackchannel(selected.verbal);

    log.debug(
      { persona: personaId, backchannel: selected.verbal, silenceMs: context.silenceDurationMs },
      'Generated silence-aware backchannel'
    );

    return selected;
  }

  /**
   * Reset the engine state
   */
  reset(): void {
    this.recentBackchannels = [];
    this.lastBackchannelTime = 0;
    this.extractedUserVocabulary.clear();
    log.debug('ActiveListeningEngine reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private buildSeedBase(personaId: string, context: BackchannelContext): string {
    return `backchannel:${personaId}:${context.topicSeriousness ?? 'casual'}:${context.userEmotion ?? ''}:${context.userEnergy ?? ''}:${context.userAskedQuestion ? 'q' : 'nq'}:${context.userJustSharedSomethingPersonal ? 'personal' : 'normal'}`;
  }

  private selectBackchannelType(context: BackchannelContext): Backchannel['type'] {
    if (context.userJustSharedSomethingPersonal || context.topicSeriousness === 'emotional') {
      return 'empathy';
    }

    if (context.userAskedQuestion) {
      return 'acknowledgment';
    }

    if (context.userEmotion) {
      const emotionToType: Record<string, Backchannel['type']> = {
        sad: 'empathy',
        worried: 'empathy',
        anxious: 'empathy',
        frustrated: 'empathy',
        excited: 'agreement',
        happy: 'agreement',
        curious: 'curiosity',
        confused: 'encouragement',
      };
      const type = emotionToType[context.userEmotion.toLowerCase()];
      if (type) return type;
    }

    const seed = context.randomSeed ?? this.buildSeedBase('', context);
    const roll = seededIndex(`${seed}:roll`, 1000) / 1000;
    if (roll < 0.4) return 'acknowledgment';
    if (roll < 0.6) return 'encouragement';
    if (roll < 0.8) return 'curiosity';
    return 'agreement';
  }

  private recordBackchannel(phrase: string): void {
    this.recentBackchannels.push(phrase);
    if (this.recentBackchannels.length > 6) {
      this.recentBackchannels.shift();
    }
    this.lastBackchannelTime = Date.now();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ActiveListeningEngine | null = null;

export function getActiveListeningEngine(): ActiveListeningEngine {
  if (!instance) {
    instance = new ActiveListeningEngine();
  }
  return instance;
}

export function resetActiveListeningEngine(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default ActiveListeningEngine;

