/**
 * Speech Naturalizer Engine
 *
 * Makes AI speech sound more human through strategic imperfections.
 *
 * @module @ferni/conversation/speech-naturalizer/engine
 */

import { chance, createSeededRandom, createSystemRandom, type RandomSource } from '../utils/rng.js';
import { requestThinkingPhrase, wasPhraseUsedThisTurn } from '../thinking-phrase-coordinator.js';

import type {
  DisfluencyConfig,
  DisfluencyPatterns,
  NaturalizationContext,
  RandomOptions,
  ThinkingPattern,
} from './types.js';
import {
  DEFAULT_DISFLUENCIES,
  getPatternsForPersona,
  HEDGES_BY_STRENGTH,
  TYPE_SPECIFIC_THINKING,
} from './patterns.js';

function getRng(options: RandomOptions | undefined, salt: string): RandomSource {
  if (options?.rng) return options.rng;
  if (options?.randomSeed) return createSeededRandom(`${options.randomSeed}:${salt}`);
  return createSystemRandom();
}

export class SpeechNaturalizer {
  private config: DisfluencyConfig;
  private recentDisfluencies: string[] = [];
  private lastRepairTurn = -10;

  constructor(config?: Partial<DisfluencyConfig>) {
    this.config = {
      enabled: true,
      frequency: 0.15,
      personaStyle: 'natural',
      contextSensitivity: true,
      ...config,
    };
  }

  /**
   * Add natural disfluencies to a response
   */
  naturalize(text: string, personaId: string, context: NaturalizationContext = {}): string {
    if (!this.config.enabled) return text;

    const patterns = getPatternsForPersona(personaId);
    let result = text;

    // Adjust frequency based on context
    let effectiveFrequency = this.config.frequency;
    if (this.config.contextSensitivity) {
      if (context.isSeriousContext) {
        effectiveFrequency *= 0.3;
      }
      if (context.emotion === 'distressed' || context.emotion === 'anxious') {
        effectiveFrequency *= 0.5;
      }
      if (context.turnNumber && context.turnNumber < 3) {
        effectiveFrequency *= 0.5;
      }
    }

    const rng = getRng(context, `speech-naturalize:${personaId}:${context.turnNumber ?? 0}`);
    const roll = rng.nextFloat();

    if (roll < effectiveFrequency * 0.4) {
      result = this.addOpeningFiller(result, patterns, rng);
    } else if (roll < effectiveFrequency * 0.7) {
      result = this.addHedge(result, patterns, rng);
    } else if (roll < effectiveFrequency) {
      result = this.addThinkingPhrase(result, patterns, context, rng);
    }

    return result;
  }

  /**
   * Generate a self-correction/repair
   */
  generateRepair(
    originalStatement: string,
    correctedStatement: string,
    personaId: string,
    options?: RandomOptions
  ): string {
    const patterns = getPatternsForPersona(personaId);
    const rng = getRng(
      options,
      `speech-repair:${personaId}:${originalStatement}:${correctedStatement}`
    );
    const repair = patterns.repairs[rng.nextInt(patterns.repairs.length)];
    return `${originalStatement}<break time="200ms"/> ${repair} ${correctedStatement}`;
  }

  /**
   * Get a thinking-out-loud phrase
   *
   * Uses ThinkingPhraseCoordinator to prevent duplicate phrases.
   */
  getThinkingPhrase(
    personaId: string,
    type: ThinkingPattern['type'] = 'processing',
    options?: RandomOptions
  ): ThinkingPattern {
    // Check coordinator if session info is available
    if (options?.sessionId && options?.turnNumber !== undefined) {
      if (wasPhraseUsedThisTurn(options.sessionId, options.turnNumber)) {
        return { type, phrase: '', ssml: '' };
      }

      const result = requestThinkingPhrase(
        options.sessionId,
        options.turnNumber,
        'speech-naturalizer',
        personaId,
        { isQuestion: type === 'processing' }
      );

      if (result.granted && result.phrase) {
        return {
          type,
          phrase: result.phrase,
          ssml: result.ssml || `<break time="200ms"/>${result.phrase}<break time="300ms"/>`,
        };
      }

      return { type, phrase: '', ssml: '' };
    }

    // Fallback for legacy compatibility
    const patterns = getPatternsForPersona(personaId);
    const rng = getRng(options, `speech-thinking:${personaId}:${type}`);

    const candidates = [...patterns.thinkingPhrases, ...TYPE_SPECIFIC_THINKING[type]];
    const phrase = candidates[rng.nextInt(candidates.length)];

    return {
      type,
      phrase,
      ssml: `<break time="200ms"/>${phrase}<break time="300ms"/>`,
    };
  }

  /**
   * Generate a hedge appropriate to the statement
   */
  getHedge(
    personaId: string,
    strength: 'soft' | 'medium' | 'strong' = 'medium',
    options?: RandomOptions
  ): string {
    const patterns = getPatternsForPersona(personaId);
    const rng = getRng(options, `speech-hedge:${personaId}:${strength}`);

    const personalHedge = patterns.hedges[rng.nextInt(patterns.hedges.length)];
    const strengthHedge =
      HEDGES_BY_STRENGTH[strength][rng.nextInt(HEDGES_BY_STRENGTH[strength].length)];

    return chance(rng, 0.6) ? personalHedge : strengthHedge;
  }

  /**
   * Wrap text with uncertainty markers
   */
  addUncertainty(
    text: string,
    personaId: string,
    level: 'low' | 'medium' | 'high',
    options?: RandomOptions
  ): string {
    const hedge = this.getHedge(
      personaId,
      level === 'high' ? 'strong' : level === 'medium' ? 'medium' : 'soft',
      options
    );

    if (level === 'high') {
      return `${hedge}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }

    if (chance(getRng(options, `speech-uncertainty:${personaId}:${level}:${text}`), 0.5)) {
      return `${hedge}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }

    const firstComma = text.indexOf(',');
    if (firstComma > 10 && firstComma < text.length / 2) {
      return `${text.slice(0, firstComma + 1)} ${hedge.toLowerCase()},${text.slice(firstComma + 1)}`;
    }

    return `${hedge}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  /**
   * Reset tracking
   */
  reset(): void {
    this.recentDisfluencies = [];
    this.lastRepairTurn = -10;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private addOpeningFiller(text: string, patterns: DisfluencyPatterns, rng: RandomSource): string {
    const available = patterns.fillers.filter((f) => !this.recentDisfluencies.includes(f));
    if (available.length === 0) {
      this.recentDisfluencies = [];
      return text;
    }

    const filler = available[rng.nextInt(available.length)];
    this.recentDisfluencies.push(filler);
    if (this.recentDisfluencies.length > 5) {
      this.recentDisfluencies.shift();
    }

    return `${filler} ${text}`;
  }

  private addHedge(text: string, patterns: DisfluencyPatterns, rng: RandomSource): string {
    const hedge = patterns.hedges[rng.nextInt(patterns.hedges.length)];

    const insertPoints = [
      { pattern: /^I (think|believe|feel|know)/i, replace: false },
      { pattern: /^(The |It |This |That )/i, replace: true },
      { pattern: /^(You should|You could|You might)/i, replace: true },
    ];

    for (const point of insertPoints) {
      if (point.pattern.test(text)) {
        if (point.replace) {
          return text.replace(
            point.pattern,
            `${hedge}, ${text.match(point.pattern)?.[0].toLowerCase() || ''}`
          );
        }
        return text;
      }
    }

    return `${hedge}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  private addThinkingPhrase(
    text: string,
    patterns: DisfluencyPatterns,
    context: NaturalizationContext,
    rng: RandomSource
  ): string {
    const thinkingPhrase = patterns.thinkingPhrases[rng.nextInt(patterns.thinkingPhrases.length)];
    return `${thinkingPhrase} ${text}`;
  }
}

export default SpeechNaturalizer;
