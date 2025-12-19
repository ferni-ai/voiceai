/**
 * Shared Persona Turn Personality Processor
 *
 * Provides turn-level personality injection for all personas (not just Ferni).
 * Uses the shared LLM expression system and advanced humanization.
 *
 * Architecture:
 * 1. Detect conversation signals (subtext, energy, emotional moments)
 * 2. Generate appropriate response (from LLM or static pool)
 * 3. Track engagement for cross-session learning
 *
 * @module personas/shared/persona-turn-personality
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  generatePersonaExpressions,
  getPersonaExpression,
  hasPersonaExpressionSupport,
  PERSONA_CONFIGS,
  type ExpressionContext,
  type GeneratedExpression,
} from './persona-llm-expressions.js';
import {
  generateHumanizationLLM,
  type HumanizationType,
  type SubtextType,
  type AftercareType,
  type EnergyType,
  type AffirmationType,
} from './llm-advanced-humanization.js';

const log = createLogger({ module: 'persona-turn-personality' });

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaTurnInput {
  personaId: string;
  sessionId: string;
  userId?: string;
  turnCount: number;
  userTranscript: string;

  // Voice signals
  pauseBeforeMs?: number;
  speechRateWPM?: number;
  voiceEmotion?: {
    primary?: string;
    arousal?: number;
    valence?: number;
    confidence?: number;
  };

  // Text analysis
  textEmotion?: {
    primary?: string;
    intensity?: number;
    distressLevel?: number;
    valence?: string;
  };

  // Conversation state
  momentum?: 'opening' | 'building' | 'cruising' | 'winding_down' | 'peaking' | 'intimate' | 'closing' | 'stalled';
  topics?: string[];

  // Relationship
  relationshipStage?: string;
  totalConversations?: number;

  // Flags
  isHeavyTopic?: boolean;
  wasPersonalSharing?: boolean;
}

export interface PersonaTurnResult {
  shouldInject: boolean;

  // Expression to add (personality flourish)
  expression?: {
    theme: string;
    content: string;
    ssml: string;
    id?: string;
  };

  // Humanization response (subtext, aftercare, energy)
  humanization?: {
    type: 'subtext' | 'aftercare' | 'energy' | 'affirmation';
    subtype?: string;
    content: string;
    ssml: string;
  };

  // Where to inject
  injectionPoint: 'before_response' | 'mid_response' | 'after_response' | 'as_acknowledgment';
}

// ============================================================================
// SIGNAL DETECTION
// ============================================================================

interface DetectedSignals {
  needsSubtext: boolean;
  subtextType?: 'deflection' | 'minimizing' | 'testing_waters';

  needsAftercare: boolean;
  aftercareType?: 'holding' | 'grounding';

  needsEnergyMatch: boolean;
  energyType?: 'matching_low' | 'matching_high' | 'leading_up' | 'grounding';

  needsAffirmation: boolean;
  affirmationType?: 'acknowledgment' | 'validation' | 'encouragement';
}

function detectSignals(input: PersonaTurnInput): DetectedSignals {
  const signals: DetectedSignals = {
    needsSubtext: false,
    needsAftercare: false,
    needsEnergyMatch: false,
    needsAffirmation: false,
  };

  const transcript = input.userTranscript.toLowerCase();
  const distress = input.textEmotion?.distressLevel || 0;
  const intensity = input.textEmotion?.intensity || 0;

  // SUBTEXT DETECTION
  // Deflection: "I'm fine", "It's nothing", short dismissive responses
  if (
    transcript.match(/\b(i'?m fine|it'?s fine|i'?m ok(ay)?|it'?s nothing|whatever)\b/i) &&
    transcript.length < 50
  ) {
    signals.needsSubtext = true;
    signals.subtextType = 'deflection';
  }

  // Minimizing: Downplaying something significant
  if (
    transcript.match(/\b(not a big deal|doesn'?t matter|it'?s just|no big deal)\b/i) &&
    intensity > 0.4
  ) {
    signals.needsSubtext = true;
    signals.subtextType = 'minimizing';
  }

  // Testing waters: Hesitant language before vulnerable share
  if (
    transcript.match(/\b(i don'?t know if|maybe i|i was thinking|i'?ve been meaning to)\b/i) &&
    input.pauseBeforeMs && input.pauseBeforeMs > 1500
  ) {
    signals.needsSubtext = true;
    signals.subtextType = 'testing_waters';
  }

  // AFTERCARE DETECTION
  // After heavy emotional sharing
  if (distress > 0.6 || input.isHeavyTopic) {
    signals.needsAftercare = true;
    signals.aftercareType = distress > 0.7 ? 'holding' : 'grounding';
  }

  // ENERGY DETECTION
  // Low energy: Short responses, low arousal, slow speech
  if (
    (input.speechRateWPM && input.speechRateWPM < 100) ||
    (input.voiceEmotion?.arousal && input.voiceEmotion.arousal < 0.3) ||
    (transcript.length < 30 && input.turnCount > 3)
  ) {
    signals.needsEnergyMatch = true;
    signals.energyType = 'matching_low';
  }

  // High energy: Excitement detected
  if (
    transcript.match(/\b(so excited|can'?t wait|amazing|awesome|yes!)\b/i) ||
    (input.voiceEmotion?.arousal && input.voiceEmotion.arousal > 0.7)
  ) {
    signals.needsEnergyMatch = true;
    signals.energyType = 'matching_high';
  }

  // AFFIRMATION DETECTION
  // After user shares something meaningful
  if (input.wasPersonalSharing || intensity > 0.5) {
    signals.needsAffirmation = true;
    signals.affirmationType = distress > 0.4 ? 'validation' : 'acknowledgment';
  }

  return signals;
}

// ============================================================================
// ADVANCED HUMANIZATION LOADING
// ============================================================================

interface AdvancedHumanization {
  subtext_responses?: {
    deflection?: string[];
    minimizing?: string[];
    testing_waters?: string[];
  };
  emotional_aftercare?: {
    transition_phrases?: {
      holding?: string[];
      grounding?: string[];
    };
    check_in_questions?: string[];
  };
  energy_regulation?: {
    matching_low?: string[];
    matching_high?: string[];
    leading_up?: string[];
    grounding?: string[];
  };
  micro_affirmations?: {
    acknowledgments?: string[];
    validations?: string[];
    encouragements?: string[];
  };
}

const humanizationCache = new Map<string, AdvancedHumanization>();

async function loadHumanization(personaId: string): Promise<AdvancedHumanization | null> {
  // Check cache
  const cached = humanizationCache.get(personaId);
  if (cached) return cached;

  try {
    // Dynamic import based on persona
    const module = await import(
      `../bundles/${personaId}/content/behaviors/advanced-humanization.json`,
      { with: { type: 'json' } }
    );
    const humanization = module.default as AdvancedHumanization;
    humanizationCache.set(personaId, humanization);
    return humanization;
  } catch {
    log.debug({ personaId }, 'No advanced humanization found for persona');
    return null;
  }
}

function selectFromPool(pool: string[] | undefined): string | null {
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process a turn for any persona's personality injection
 */
export async function processPersonaTurn(input: PersonaTurnInput): Promise<PersonaTurnResult> {
  const { personaId } = input;

  // Check if this persona is supported
  if (!hasPersonaExpressionSupport(personaId)) {
    return { shouldInject: false, injectionPoint: 'after_response' };
  }

  // Detect what the user needs
  const signals = detectSignals(input);

  // Load humanization content
  const humanization = await loadHumanization(personaId);

  // Build result
  const result: PersonaTurnResult = {
    shouldInject: false,
    injectionPoint: 'after_response',
  };

  // Build humanization context for LLM
  const humanizationContext = {
    personaId,
    userTranscript: input.userTranscript,
    emotion: input.textEmotion?.primary,
    distressLevel: input.textEmotion?.distressLevel,
    intensity: input.textEmotion?.intensity,
    relationshipStage: input.relationshipStage,
    timeOfDay: getTimeOfDay(),
  };

  // Priority 1: Subtext responses (reading between the lines)
  if (signals.needsSubtext && signals.subtextType) {
    // Try LLM first (async, non-blocking for future calls)
    const llmResult = await generateHumanizationLLM({
      ...humanizationContext,
      type: 'subtext' as HumanizationType,
      subtype: signals.subtextType as SubtextType,
    });

    if (llmResult) {
      result.shouldInject = true;
      result.humanization = {
        type: 'subtext',
        subtype: signals.subtextType,
        content: llmResult.content,
        ssml: llmResult.ssml,
      };
      result.injectionPoint = 'before_response';
      log.debug({ personaId, type: signals.subtextType, source: 'llm' }, '🎭 LLM subtext response');
      return result;
    }

    // Fallback to static pool
    if (humanization?.subtext_responses) {
      const pool = humanization.subtext_responses[signals.subtextType];
      const content = selectFromPool(pool);
      if (content) {
        result.shouldInject = true;
        result.humanization = {
          type: 'subtext',
          subtype: signals.subtextType,
          content,
          ssml: content,
        };
        result.injectionPoint = 'before_response';
        log.debug({ personaId, type: signals.subtextType, source: 'pool' }, '🎭 Pool subtext response');
        return result;
      }
    }
  }

  // Priority 2: Emotional aftercare
  if (signals.needsAftercare && signals.aftercareType) {
    // Try LLM first
    const llmResult = await generateHumanizationLLM({
      ...humanizationContext,
      type: 'aftercare' as HumanizationType,
      subtype: signals.aftercareType as AftercareType,
    });

    if (llmResult) {
      result.shouldInject = true;
      result.humanization = {
        type: 'aftercare',
        subtype: signals.aftercareType,
        content: llmResult.content,
        ssml: llmResult.ssml,
      };
      result.injectionPoint = 'before_response';
      log.debug({ personaId, type: signals.aftercareType, source: 'llm' }, '🎭 LLM aftercare response');
      return result;
    }

    // Fallback to static pool
    if (humanization?.emotional_aftercare) {
      const pool = humanization.emotional_aftercare.transition_phrases?.[signals.aftercareType];
      const content = selectFromPool(pool);
      if (content) {
        result.shouldInject = true;
        result.humanization = {
          type: 'aftercare',
          subtype: signals.aftercareType,
          content,
          ssml: content,
        };
        result.injectionPoint = 'before_response';
        log.debug({ personaId, type: signals.aftercareType, source: 'pool' }, '🎭 Pool aftercare response');
        return result;
      }
    }
  }

  // Priority 3: Energy matching
  if (signals.needsEnergyMatch && signals.energyType) {
    // Try LLM first
    const llmResult = await generateHumanizationLLM({
      ...humanizationContext,
      type: 'energy' as HumanizationType,
      subtype: signals.energyType as EnergyType,
    });

    if (llmResult) {
      result.shouldInject = true;
      result.humanization = {
        type: 'energy',
        subtype: signals.energyType,
        content: llmResult.content,
        ssml: llmResult.ssml,
      };
      result.injectionPoint = 'before_response';
      log.debug({ personaId, type: signals.energyType, source: 'llm' }, '🎭 LLM energy response');
      return result;
    }

    // Fallback to static pool
    if (humanization?.energy_regulation) {
      const pool = humanization.energy_regulation[signals.energyType];
      const content = selectFromPool(pool);
      if (content) {
        result.shouldInject = true;
        result.humanization = {
          type: 'energy',
          subtype: signals.energyType,
          content,
          ssml: content,
        };
        result.injectionPoint = 'before_response';
        log.debug({ personaId, type: signals.energyType, source: 'pool' }, '🎭 Pool energy response');
        return result;
      }
    }
  }

  // Priority 4: Expression flourishes (personality color)
  // Only add expression if we're not doing humanization
  if (input.turnCount > 2 && Math.random() < 0.3) {
    // 30% chance on turn 3+
    const config = PERSONA_CONFIGS[personaId];
    if (config) {
      // Pick a theme based on context
      const theme = pickThemeForContext(config.themes, input);

      // Try to get from cache first
      let expression = getPersonaExpression(personaId, theme, buildExpressionContext(input));

      // If not in cache, generate (non-blocking, for future)
      if (!expression) {
        void generatePersonaExpressions(personaId, [theme], buildExpressionContext(input));
      } else {
        result.shouldInject = true;
        result.expression = {
          theme: expression.theme,
          content: expression.content,
          ssml: expression.ssml,
          id: expression.id,
        };
        result.injectionPoint = 'after_response';
        log.debug({ personaId, theme }, '🎭 Expression flourish added');
      }
    }
  }

  // Priority 5: Micro-affirmations (subtle acknowledgments)
  if (signals.needsAffirmation && signals.affirmationType && !result.shouldInject) {
    // Try LLM first (only if we haven't already added something)
    const llmResult = await generateHumanizationLLM({
      ...humanizationContext,
      type: 'affirmation' as HumanizationType,
      subtype: signals.affirmationType as AffirmationType,
    });

    if (llmResult) {
      result.shouldInject = true;
      result.humanization = {
        type: 'affirmation',
        subtype: signals.affirmationType,
        content: llmResult.content,
        ssml: llmResult.ssml,
      };
      result.injectionPoint = 'as_acknowledgment';
      log.debug({ personaId, type: signals.affirmationType, source: 'llm' }, '🎭 LLM affirmation');
    } else if (humanization?.micro_affirmations) {
      // Fallback to static pool
      const poolMap: Record<string, string[] | undefined> = {
        acknowledgment: humanization.micro_affirmations.acknowledgments,
        validation: humanization.micro_affirmations.validations,
        encouragement: humanization.micro_affirmations.encouragements,
      };
      const pool = poolMap[signals.affirmationType];
      const content = selectFromPool(pool);
      if (content) {
        result.shouldInject = true;
        result.humanization = {
          type: 'affirmation',
          subtype: signals.affirmationType,
          content,
          ssml: content,
        };
        result.injectionPoint = 'as_acknowledgment';
        log.debug({ personaId, type: signals.affirmationType, source: 'pool' }, '🎭 Pool affirmation');
      }
    }
  }

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'late_night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

function pickThemeForContext(
  themes: Array<{ id: string; contextHints?: string[] }>,
  input: PersonaTurnInput
): string {
  // Filter themes by context hints
  const matchingThemes = themes.filter((t) => {
    if (!t.contextHints) return true;
    return t.contextHints.some((hint) => {
      if (hint.includes('progress') && input.wasPersonalSharing) return true;
      if (hint.includes('energy') && input.voiceEmotion?.arousal) return true;
      if (hint.includes('tired') && input.speechRateWPM && input.speechRateWPM < 100) return true;
      return false;
    });
  });

  const pool = matchingThemes.length > 0 ? matchingThemes : themes;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

function buildExpressionContext(input: PersonaTurnInput): ExpressionContext {
  const hour = new Date().getHours();
  return {
    emotion: input.textEmotion?.primary,
    timeOfDay:
      hour >= 5 && hour < 12
        ? 'morning'
        : hour >= 12 && hour < 17
          ? 'afternoon'
          : hour >= 17 && hour < 22
            ? 'evening'
            : 'late_night',
    momentum: input.momentum,
    relationshipStage: input.relationshipStage,
    topic: input.topics?.[0],
  };
}

/**
 * Apply personality result to response
 */
export function applyPersonaPersonalityToResponse(
  rawResponse: string,
  result: PersonaTurnResult
): string {
  if (!result.shouldInject) return rawResponse;

  let response = rawResponse;

  // Apply humanization
  if (result.humanization) {
    const content = result.humanization.ssml;
    switch (result.injectionPoint) {
      case 'before_response':
        response = `${content} <break time="300ms"/>${response}`;
        break;
      case 'as_acknowledgment':
        response = `${content} <break time="200ms"/>${response}`;
        break;
      case 'after_response':
        response = `${response} <break time="200ms"/>${content}`;
        break;
    }
  }

  // Apply expression
  if (result.expression) {
    if (result.injectionPoint === 'after_response') {
      response = `${response} <break time="200ms"/>${result.expression.ssml}`;
    }
  }

  return response.replace(/\s+/g, ' ').trim();
}

/**
 * Check if a persona has turn personality support
 */
export function hasPersonaTurnSupport(personaId: string): boolean {
  return hasPersonaExpressionSupport(personaId);
}

// Export for use in turn handler
export const sharedPersonality = {
  processTurn: processPersonaTurn,
  applyToResponse: applyPersonaPersonalityToResponse,
  hasSupport: hasPersonaTurnSupport,
};

