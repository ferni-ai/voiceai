/**
 * Strategic Disfluency Injection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Disfluencies like "um", "uh", "well", and "you know" aren't mistakes—they're
 * natural speech patterns that signal genuine thinking. Strategic use makes
 * complex responses feel more considered, not less intelligent.
 *
 * **When to use:**
 * - Before answering complex questions (signals processing)
 * - When navigating emotional topics (signals care)
 * - When uncertain (authenticity)
 * - Early in conversation (warming up)
 *
 * **When NOT to use:**
 * - Simple factual responses
 * - Greetings
 * - Crisis situations (need confidence)
 * - Already highly humanized content
 *
 * @module @ferni/humanization/disfluency-injection
 */

import { seededChance, seededFloat, seededIndex, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  HumanizationContext,
  HumanizationDecision,
  HumanizationInjection,
  InjectionPlacement,
} from './types.js';

const logger = createLogger({ module: 'DisfluencyInjection' });

// ============================================================================
// TYPES
// ============================================================================

export type DisfluencyType =
  | 'filled_pause' // "um", "uh"
  | 'discourse_marker' // "so", "well", "you know"
  | 'lengthening' // "thiiiink", "maaaybe"
  | 'false_start' // "I—I think", "that—that's"
  | 'repetition'; // "that's, that's interesting"

export interface DisfluencyConfig {
  /** Base probability */
  baseProbability: number;
  /** Maximum duration for audio pause (ms) */
  maxPauseDuration: number;
  /** Placement in response */
  placement: InjectionPlacement;
}

export interface DisfluencyState {
  usageCount: number;
  lastUsageTurn: number;
  recentTypes: DisfluencyType[];
}

export interface DisfluencyResult extends HumanizationInjection {
  type: 'disfluency';
  disfluencyType: DisfluencyType;
  pauseDuration: number;
}

// ============================================================================
// DISFLUENCY PATTERNS
// ============================================================================

const DISFLUENCY_PATTERNS: Record<
  DisfluencyType,
  {
    patterns: string[];
    ssmlPatterns: string[];
    probability: number;
    placement: InjectionPlacement;
    contexts: string[]; // When this type is appropriate
  }
> = {
  filled_pause: {
    patterns: ['Um', 'Uh', 'Hmm', 'Mm'],
    ssmlPatterns: [
      '<break time="180ms"/>Um<break time="220ms"/>',
      '<break time="120ms"/>Uh<break time="180ms"/>',
      '<break time="250ms"/>Hmm<break time="300ms"/>',
      '<break time="100ms"/>Mm<break time="150ms"/>',
    ],
    probability: 0.16, // Increased from 0.12 for more natural feel
    placement: 'opening',
    contexts: ['complex_question', 'thinking', 'uncertain'],
  },

  discourse_marker: {
    patterns: ['So', 'Well', 'You know', 'I mean', 'Okay so', 'Yeah', 'Right'],
    ssmlPatterns: [
      'So,<break time="120ms"/>',
      'Well,<break time="180ms"/>',
      'You know,<break time="120ms"/>',
      'I mean,<break time="120ms"/>',
      'Okay so,<break time="120ms"/>',
      'Yeah,<break time="100ms"/>',
      'Right,<break time="100ms"/>',
    ],
    probability: 0.18, // Increased from 0.15 for more natural conversation
    placement: 'opening',
    contexts: ['any', 'emotional', 'explaining'],
  },

  lengthening: {
    patterns: ['I thiiink', 'Maaaybe', 'Weeeell'],
    ssmlPatterns: [
      '<prosody rate="70%">I think</prosody><break time="100ms"/>',
      '<prosody rate="70%">Maybe</prosody><break time="100ms"/>',
      '<prosody rate="70%">Well</prosody><break time="100ms"/>',
    ],
    probability: 0.05,
    placement: 'opening',
    contexts: ['uncertain', 'considering'],
  },

  false_start: {
    patterns: ['I—I', "That's—that's", "It's—it's"],
    ssmlPatterns: [
      'I—<break time="80ms"/>I',
      'That\'s—<break time="80ms"/>that\'s',
      'It\'s—<break time="80ms"/>it\'s',
    ],
    probability: 0.08,
    placement: 'opening',
    contexts: ['emotional', 'important_point'],
  },

  repetition: {
    patterns: ['{word}, {word}'],
    ssmlPatterns: ['{word},<break time="100ms"/> {word}'],
    probability: 0.06,
    placement: 'before_key_point',
    contexts: ['emphasis', 'emotional'],
  },
};

// ============================================================================
// PERSONA-SPECIFIC PREFERENCES
// ============================================================================

const PERSONA_DISFLUENCY_PREFERENCES: Record<
  string,
  {
    preferredTypes: DisfluencyType[];
    filledPauseStyle: string[];
    discourseMarkers: string[];
    probabilityMultiplier: number;
  }
> = {
  ferni: {
    preferredTypes: ['discourse_marker', 'filled_pause', 'false_start'],
    filledPauseStyle: ['Um', 'Hmm'],
    discourseMarkers: ['Well', 'You know', 'So', 'I mean', 'Okay'],
    probabilityMultiplier: 1.3, // Ferni should sound natural and human
  },

  'nayan-patel': {
    preferredTypes: ['discourse_marker', 'lengthening'],
    filledPauseStyle: ['Hmm'],
    discourseMarkers: ['Well', 'You know'],
    probabilityMultiplier: 0.8, // More polished
  },

  'maya-santos': {
    preferredTypes: ['discourse_marker', 'filled_pause', 'false_start'],
    filledPauseStyle: ['Um', 'Uh'],
    discourseMarkers: ['So', 'Okay so', 'I mean'],
    probabilityMultiplier: 1.2, // More casual
  },

  'alex-chen': {
    preferredTypes: ['discourse_marker'],
    filledPauseStyle: ['Hmm'],
    discourseMarkers: ['So', 'Well'],
    probabilityMultiplier: 0.7, // More professional
  },

  'peter-john': {
    preferredTypes: ['discourse_marker', 'filled_pause'],
    filledPauseStyle: ['Hmm', 'Um'],
    discourseMarkers: ['Well', 'You know'],
    probabilityMultiplier: 1.0,
  },

  'jordan-taylor': {
    preferredTypes: ['discourse_marker', 'filled_pause'],
    filledPauseStyle: ['Um', 'Uh'],
    discourseMarkers: ['So', 'Okay', 'I mean'],
    probabilityMultiplier: 1.1,
  },
};

// ============================================================================
// ENGINE CONFIG
// ============================================================================

interface DisfluencyEngineConfig {
  maxPerSession: number;
  cooldownTurns: number;
  minTurn: number;
  skipSimpleResponses: boolean;
  simpleResponseThreshold: number; // Word count
  enabledTypes: DisfluencyType[];
}

const DEFAULT_ENGINE_CONFIG: DisfluencyEngineConfig = {
  maxPerSession: 6,
  cooldownTurns: 3,
  minTurn: 1, // Can start early
  skipSimpleResponses: true,
  simpleResponseThreshold: 20,
  enabledTypes: ['filled_pause', 'discourse_marker', 'false_start'],
};

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

/**
 * Detect what context the response is in
 */
function detectContexts(context: HumanizationContext): string[] {
  const contexts: string[] = ['any'];

  // Question complexity
  if (context.userMessage.includes('?')) {
    const words = context.userMessage.split(/\s+/).length;
    if (words > 15 || /how (do|should|can|would)/i.test(context.userMessage)) {
      contexts.push('complex_question');
    }
  }

  // Emotional content
  if (context.isEmotionalContent || context.userEmotion) {
    contexts.push('emotional');
  }

  // Uncertainty indicators
  if (/\b(maybe|might|could|probably|I think|not sure)\b/i.test(context.responseText)) {
    contexts.push('uncertain');
  }

  // Explaining something
  if (context.responseWordCount > 40) {
    contexts.push('explaining');
  }

  // Thinking/processing
  if (
    context.responseText.includes('...') ||
    /\b(let me think|hmm)\b/i.test(context.responseText)
  ) {
    contexts.push('thinking');
  }

  // Important point
  if (/\b(important|key|crucial|really|actually)\b/i.test(context.responseText)) {
    contexts.push('important_point');
  }

  // Considering options
  if (/\b(on one hand|either|or maybe|another way)\b/i.test(context.responseText)) {
    contexts.push('considering');
  }

  // Emphasis
  if (/\b(really|very|so|truly|genuinely)\b/i.test(context.responseText)) {
    contexts.push('emphasis');
  }

  return contexts;
}

/**
 * Check if response is too simple for disfluency
 */
function isSimpleResponse(context: HumanizationContext, threshold: number): boolean {
  // Very short
  if (context.responseWordCount < threshold) return true;

  // Greetings
  if (/^(hi|hello|hey|good morning|good afternoon|welcome)/i.test(context.responseText)) {
    return true;
  }

  // Simple acknowledgments
  if (/^(yes|no|okay|sure|got it|understood|thanks)/i.test(context.responseText)) {
    return true;
  }

  // Factual/lookup responses
  if (/^(the|it's|that's) \d/i.test(context.responseText)) {
    return true;
  }

  return false;
}

// ============================================================================
// DISFLUENCY ENGINE
// ============================================================================

export class DisfluencyEngine {
  private state: DisfluencyState;
  private config: DisfluencyEngineConfig;

  constructor(config: Partial<DisfluencyEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.state = {
      usageCount: 0,
      lastUsageTurn: -999,
      recentTypes: [],
    };
    logger.debug('DisfluencyEngine initialized');
  }

  /**
   * Decide if disfluency should be applied
   */
  shouldApply(context: HumanizationContext): HumanizationDecision {
    // Check basic constraints
    if (context.turnCount < this.config.minTurn) {
      return {
        shouldApply: false,
        reason: `Too early (turn ${context.turnCount})`,
      };
    }

    if (this.state.usageCount >= this.config.maxPerSession) {
      return {
        shouldApply: false,
        reason: `Max per session reached (${this.state.usageCount})`,
      };
    }

    const turnsSinceLastUse = context.turnCount - this.state.lastUsageTurn;
    if (turnsSinceLastUse < this.config.cooldownTurns) {
      return {
        shouldApply: false,
        reason: `Cooldown active (${turnsSinceLastUse} < ${this.config.cooldownTurns})`,
      };
    }

    // Check if response is too simple
    if (
      this.config.skipSimpleResponses &&
      isSimpleResponse(context, this.config.simpleResponseThreshold)
    ) {
      return {
        shouldApply: false,
        reason: 'Response too simple for disfluency',
      };
    }

    // Check if already has disfluency-like content
    if (/^(um|uh|hmm|well|so|you know)/i.test(context.responseText.trim())) {
      return {
        shouldApply: false,
        reason: 'Response already starts with disfluency',
      };
    }

    return {
      shouldApply: true,
      reason: 'Passed all checks',
    };
  }

  /**
   * Generate disfluency injection
   */
  generate(context: HumanizationContext): DisfluencyResult | null {
    const decision = this.shouldApply(context);
    if (!decision.shouldApply) {
      logger.debug({ reason: decision.reason }, 'Disfluency skipped');
      return null;
    }

    // Get persona preferences
    const personaPrefs = PERSONA_DISFLUENCY_PREFERENCES[context.personaId] || {
      preferredTypes: ['discourse_marker', 'filled_pause'],
      filledPauseStyle: ['Um', 'Hmm'],
      discourseMarkers: ['Well', 'So'],
      probabilityMultiplier: 1.0,
    };

    // Detect context
    const contexts = detectContexts(context);

    // Choose disfluency type
    const type = this.chooseDisfluencyType(context, personaPrefs, contexts);
    if (!type) {
      return null;
    }

    // Get pattern for this type
    const patternConfig = DISFLUENCY_PATTERNS[type];

    // Calculate probability
    let probability = patternConfig.probability * personaPrefs.probabilityMultiplier;

    // EARLY TURN BOOST: First few turns are CRITICAL for setting human tone
    // Boost probability on turns 1-3 to make Ferni feel more natural from the start
    if (context.turnCount <= 3) {
      const earlyTurnBoost = 1.5 - context.turnCount * 0.15; // 1.35x on turn 1, 1.2x on turn 2, 1.05x on turn 3
      probability *= earlyTurnBoost;
      logger.debug({ turnCount: context.turnCount, earlyTurnBoost }, 'Applied early turn boost');
    }

    // Adjust for context appropriateness
    const contextMatch = patternConfig.contexts.some((c) => contexts.includes(c));
    if (!contextMatch) {
      probability *= 0.5;
    }

    // Adjust for early conversation (more natural to have disfluencies early)
    if (context.turnCount < 5) {
      probability *= 1.3;
    }

    // Roll the dice
    if (!seededChance(`${context.turnCount}:disfluency:roll`, probability)) {
      return null;
    }

    // Choose specific pattern
    const { pattern, ssml } = this.choosePattern(type, personaPrefs, context);

    // Record usage
    this.state.usageCount++;
    this.state.lastUsageTurn = context.turnCount;
    this.state.recentTypes.push(type);
    if (this.state.recentTypes.length > 5) {
      this.state.recentTypes.shift();
    }

    const result: DisfluencyResult = {
      type: 'disfluency',
      disfluencyType: type,
      content: pattern,
      ssml,
      placement: patternConfig.placement,
      pauseDuration: this.calculatePauseDuration(type),
      reason: `Context: ${contexts.join(', ')}`,
    };

    logger.debug(
      {
        disfluencyType: type,
        pattern,
        turn: context.turnCount,
      },
      '🗣️ Disfluency generated'
    );

    return result;
  }

  /**
   * Apply disfluency to response
   */
  apply(response: string, disfluency: DisfluencyResult): { text: string; ssml: string } {
    // For most disfluencies, prepend to response
    if (disfluency.placement === 'opening') {
      return {
        text: `${disfluency.content}, ${response.charAt(0).toLowerCase()}${response.slice(1)}`,
        ssml: `${disfluency.ssml} ${response}`,
      };
    }

    // For repetition type, find the word to repeat
    if (disfluency.disfluencyType === 'repetition') {
      const firstWord = response.split(/\s+/)[0];
      if (firstWord) {
        const repeated = `${firstWord}, ${firstWord.toLowerCase()}`;
        const ssmlRepeated = `${firstWord},<break time="100ms"/> ${firstWord.toLowerCase()}`;
        return {
          text: response.replace(firstWord, repeated),
          ssml: response.replace(firstWord, ssmlRepeated),
        };
      }
    }

    // Default: prepend
    return {
      text: `${disfluency.content} ${response}`,
      ssml: `${disfluency.ssml} ${response}`,
    };
  }

  /**
   * Reset state for new session
   */
  reset(): void {
    this.state = {
      usageCount: 0,
      lastUsageTurn: -999,
      recentTypes: [],
    };
    logger.debug('DisfluencyEngine reset');
  }

  /**
   * Get current state
   */
  getState(): DisfluencyState {
    return { ...this.state };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private chooseDisfluencyType(
    context: HumanizationContext,
    personaPrefs: (typeof PERSONA_DISFLUENCY_PREFERENCES)['ferni'],
    contexts: string[]
  ): DisfluencyType | null {
    // Filter to enabled and preferred types
    const availableTypes = this.config.enabledTypes.filter((t) =>
      personaPrefs.preferredTypes.includes(t)
    );

    if (availableTypes.length === 0) {
      return null;
    }

    // Avoid repeating same type too often
    const recentType = this.state.recentTypes[this.state.recentTypes.length - 1];
    const filteredTypes = availableTypes.filter((t) => t !== recentType);
    const typesToChooseFrom = filteredTypes.length > 0 ? filteredTypes : availableTypes;

    // Choose based on context
    // Complex questions -> filled_pause
    if (contexts.includes('complex_question') && typesToChooseFrom.includes('filled_pause')) {
      return 'filled_pause';
    }

    // Emotional -> false_start or discourse_marker
    if (contexts.includes('emotional')) {
      if (typesToChooseFrom.includes('false_start') && seededChance(`${Date.now()}:548`, 0.3)) {
        return 'false_start';
      }
      if (typesToChooseFrom.includes('discourse_marker')) {
        return 'discourse_marker';
      }
    }

    // Uncertain -> lengthening
    if (contexts.includes('uncertain') && typesToChooseFrom.includes('lengthening')) {
      return 'lengthening';
    }

    // Default: random from available
    return seededPick(`${Date.now()}:562`, typesToChooseFrom) ?? typesToChooseFrom[0];
  }

  private choosePattern(
    type: DisfluencyType,
    personaPrefs: (typeof PERSONA_DISFLUENCY_PREFERENCES)['ferni'],
    _context: HumanizationContext
  ): { pattern: string; ssml: string } {
    const patternConfig = DISFLUENCY_PATTERNS[type];

    // Use persona-specific patterns when available
    if (type === 'filled_pause' && personaPrefs.filledPauseStyle.length > 0) {
      const pattern = seededPick(`${Date.now()}:filled_pause`, personaPrefs.filledPauseStyle) ?? personaPrefs.filledPauseStyle[0];
      return {
        pattern,
        ssml: `<break time="150ms"/>${pattern}<break time="200ms"/>`,
      };
    }

    if (type === 'discourse_marker' && personaPrefs.discourseMarkers.length > 0) {
      const pattern = seededPick(`${Date.now()}:discourse_marker`, personaPrefs.discourseMarkers) ?? personaPrefs.discourseMarkers[0];
      return {
        pattern,
        ssml: `${pattern},<break time="100ms"/>`,
      };
    }

    // Use default patterns
    const index = seededIndex(`${Date.now()}:pattern:${type}`, patternConfig.patterns.length);
    return {
      pattern: patternConfig.patterns[index],
      ssml: patternConfig.ssmlPatterns[index],
    };
  }

  private calculatePauseDuration(type: DisfluencyType): number {
    // Use seeded float for deterministic but varied pause durations
    const seed = `${Date.now()}:pause:${type}`;
    const variance = seededFloat(seed);
    
    switch (type) {
      case 'filled_pause':
        return 200 + variance * 150; // 200-350ms
      case 'discourse_marker':
        return 100 + variance * 100; // 100-200ms
      case 'lengthening':
        return 150 + variance * 100; // 150-250ms
      case 'false_start':
        return 80 + variance * 70; // 80-150ms
      case 'repetition':
        return 100 + variance * 50; // 100-150ms
      default:
        return 150;
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const engines = new Map<string, DisfluencyEngine>();

export function getDisfluencyEngine(sessionId: string): DisfluencyEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new DisfluencyEngine());
  }
  return engines.get(sessionId)!;
}

export function resetDisfluencyEngine(sessionId: string): void {
  const engine = engines.get(sessionId);
  if (engine) {
    engine.reset();
    engines.delete(sessionId);
  }
}

export function resetAllDisfluencyEngines(): void {
  engines.clear();
}

export default DisfluencyEngine;
