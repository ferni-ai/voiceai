/**
 * Speech Humanizer
 *
 * Main orchestrator for "Better Than Human" speech humanization.
 * Injects persona-specific speech imperfections, thinking sounds,
 * and other human behaviors into agent responses.
 *
 * This is the single entry point called by response-processor.ts.
 *
 * @module speech/humanization/speech-humanizer
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  loadSpeechProfile,
  selectImperfection,
  selectThinkingSound,
  selectBackchannel,
  selectBreathSound,
  getInjectionConfig,
  // Sync accessors
  areSpeechProfilesPreloaded,
  selectThinkingSoundSync,
  selectImperfectionSync,
  selectBreathSoundSync,
  // New humanization features
  selectLaughterResponse,
  selectLaughterResponseSync,
  isLateNightHours,
  getLateNightPacing,
} from './behavior-loader.js';
import {
  detectCallbackTriggers,
  selectCallback,
  injectCallback,
} from './callback-detector.js';
import type {
  BehaviorSelectionContext,
  SelectedBehavior,
  HumanizedSpeechResult,
  ImperfectionCategory,
  CoreImperfectionCategory,
} from './types.js';

const log = createLogger({ module: 'SpeechHumanizer' });

// =============================================================================
// MAIN HUMANIZATION FUNCTION
// =============================================================================

/**
 * Apply human speech behaviors to an agent response
 *
 * This is the main entry point for the speech humanization system.
 * It loads persona-specific behaviors from JSON files and injects
 * them probabilistically based on context.
 *
 * @param text - The agent's response text
 * @param context - Selection context (persona, emotion, content)
 * @returns Humanized text with applied behaviors
 */
export async function humanizeSpeech(
  text: string,
  context: BehaviorSelectionContext
): Promise<HumanizedSpeechResult> {
  const { personaId } = context;
  const config = getInjectionConfig(personaId);

  const appliedBehaviors: SelectedBehavior[] = [];
  const features: string[] = [];
  let result = text;

  // Skip humanization for very short responses
  if (text.length < 20) {
    return { text, wasHumanized: false, appliedBehaviors: [], features: [] };
  }

  // Skip humanization in serious/vulnerable contexts (respect the moment)
  if (context.emotional.isVulnerable && context.emotional.userEmotion === 'distressed') {
    log.debug({ personaId }, 'Skipping humanization - vulnerable moment');
    return { text, wasHumanized: false, appliedBehaviors: [], features: ['skipped_vulnerable'] };
  }

  // Check for late night pacing adjustments
  const isLateNight = isLateNightHours();
  if (isLateNight) {
    context.emotional.isLateNight = true;
    const lateNightPacing = getLateNightPacing(personaId);
    if (lateNightPacing) {
      features.push('late_night_mode');
      log.debug({ personaId, pacing: lateNightPacing }, 'Applied late night pacing');
    }
  }

  // Calculate injection probability based on turn number
  const turnModifier = Math.min(1, (context.turnNumber || 1) * config.turnMultiplier);
  const finalProbability = Math.min(config.baseProbability + turnModifier, 0.4);

  // Random check - should we humanize this response?
  const shouldHumanize = context.randomSeed
    ? hashCode(context.randomSeed) % 100 < finalProbability * 100
    : Math.random() < finalProbability;

  if (!shouldHumanize) {
    return { text, wasHumanized: false, appliedBehaviors: [], features: ['probability_skip'] };
  }

  try {
    // =======================================================================
    // 0. CALLBACK DETECTION - Building relationship through shared references
    // Callbacks are PRIORITIZED - they reference our shared history
    // =======================================================================
    if (context.userText && context.conversationCount !== undefined) {
      const triggers = detectCallbackTriggers(context.userText, personaId);
      if (triggers.length > 0) {
        const callback = selectCallback(
          triggers,
          personaId,
          context.conversationCount,
          context.usedCallbacks
        );
        if (callback) {
          result = injectCallback(result, callback);
          features.push(`callback:${callback.id}:${callback.useCallbackVersion ? 'repeat' : 'first'}`);
          appliedBehaviors.push({
            phrase: callback.phrase,
            category: `callback:${callback.trigger}`,
            position: 'prefix',
            confidence: callback.confidence,
            metadata: {
              source: 'backchannels',
              personaId,
              contextMatch: [callback.trigger],
            },
          });
          log.debug(
            { personaId, callbackId: callback.id, type: callback.useCallbackVersion ? 'repeat' : 'first' },
            'Injected callback phrase'
          );
        }
      }
    }

    // Try to inject behaviors in order of preference
    const behaviorsToTry: Array<() => Promise<SelectedBehavior | null>> = [];

    // 1. Thinking sounds (most natural at start)
    if (shouldAddThinkingSound(context)) {
      behaviorsToTry.push(() => selectThinkingSound(personaId, context));
    }

    // 2. Imperfections based on persona style
    for (const category of config.preferredCategories) {
      if (!config.avoidCategories.includes(category)) {
        behaviorsToTry.push(() => selectImperfection(personaId, category, context));
      }
    }

    // 3. Backchannels for responses that follow user input
    if (context.turnNumber && context.turnNumber > 1) {
      behaviorsToTry.push(() => selectBackchannel(personaId, context));
    }

    // 4. Breath sounds for heavy/vulnerable moments (lower priority, adds physical presence)
    if (shouldAddBreathSound(context)) {
      behaviorsToTry.push(() => selectBreathSound(personaId, context));
    }

    // 5. Laughter contagion (if user laughed or celebration context)
    const extendedContext = context as BehaviorSelectionContext & { userLaughed?: boolean };
    if (extendedContext.userLaughed || context.content.isCelebration) {
      behaviorsToTry.push(() => selectLaughterResponse(personaId, extendedContext));
    }

    // Apply behaviors up to max
    let injectedCount = 0;
    for (const tryBehavior of behaviorsToTry) {
      if (injectedCount >= config.maxBehaviorsPerResponse) break;

      const behavior = await tryBehavior();
      if (behavior) {
        result = injectBehavior(result, behavior, config.minCharsBetweenInjections);
        appliedBehaviors.push(behavior);
        features.push(`${behavior.metadata?.source}:${behavior.category}`);
        injectedCount++;
      }
    }

    if (appliedBehaviors.length > 0) {
      log.debug(
        { personaId, count: appliedBehaviors.length, features },
        'Applied speech humanization'
      );
    }

    return {
      text: result,
      wasHumanized: appliedBehaviors.length > 0,
      appliedBehaviors,
      features,
    };
  } catch (error) {
    log.warn({ error: String(error), personaId }, 'Speech humanization failed (non-blocking)');
    return { text, wasHumanized: false, appliedBehaviors: [], features: ['error'] };
  }
}

// =============================================================================
// INJECTION LOGIC
// =============================================================================

/**
 * Inject a behavior into text at the appropriate position
 */
function injectBehavior(
  text: string,
  behavior: SelectedBehavior,
  minCharsBetween: number
): string {
  const { phrase, position } = behavior;

  switch (position) {
    case 'prefix':
      // Add thinking sound / processing at the start
      return `${phrase} ${text}`;

    case 'suffix':
      // Add trailing off at the end (before final punctuation)
      const trailingMatch = text.match(/([.!?])$/);
      if (trailingMatch) {
        return text.slice(0, -1) + phrase + trailingMatch[1];
      }
      return `${text} ${phrase}`;

    case 'inline':
      // Find a natural break point (after a comma or period mid-sentence)
      const breakPoints = findBreakPoints(text);
      if (breakPoints.length > 0) {
        // Pick a break point that's not too early or too late
        const validBreaks = breakPoints.filter(
          (bp) => bp > minCharsBetween && bp < text.length - minCharsBetween
        );
        if (validBreaks.length > 0) {
          const insertAt = validBreaks[Math.floor(Math.random() * validBreaks.length)];
          return text.slice(0, insertAt) + ' ' + phrase + ' ' + text.slice(insertAt);
        }
      }
      // Fallback to prefix if no good break point
      return `${phrase} ${text}`;

    default:
      return `${phrase} ${text}`;
  }
}

/**
 * Find natural break points in text (after punctuation)
 */
function findBreakPoints(text: string): number[] {
  const breakPoints: number[] = [];
  const regex = /[,;:—]\s/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    breakPoints.push(match.index + match[0].length);
  }

  return breakPoints;
}

/**
 * Determine if a thinking sound should be added
 */
function shouldAddThinkingSound(context: BehaviorSelectionContext): boolean {
  // More likely when:
  // - Agent is responding to a question
  // - Agent is about to share something thoughtful
  // - Conversation is in a reflective moment

  if (context.content.isQuestion) return true;
  if (context.emotional.agentTone === 'curious') return true;
  if (context.emotional.userEmotion === 'reflective') return true;

  // Random chance for variety
  return Math.random() < 0.3;
}

/**
 * Determine if a breath sound should be added
 *
 * Breath sounds add physical presence - they're most powerful in:
 * - Vulnerable moments (user sharing hard things)
 * - Before hard truths (agent about to share something difficult)
 * - Late night conversations (intimate, quieter)
 * - Grounding moments (helping calm anxiety)
 */
function shouldAddBreathSound(context: BehaviorSelectionContext): boolean {
  // Always likely in vulnerable/late night moments
  if (context.emotional.isVulnerable) return Math.random() < 0.5;
  if (context.emotional.isLateNight) return Math.random() < 0.4;

  // Likely when comforting
  if (context.content.isComforting) return Math.random() < 0.4;

  // User in distress - breath sounds help ground
  if (context.emotional.userEmotion === 'distressed') return Math.random() < 0.5;
  if (context.emotional.userEmotion === 'anxious') return Math.random() < 0.5;

  // Lower chance in normal conversation
  return Math.random() < 0.1;
}

/**
 * Simple string hash for seeded randomness
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick humanization with minimal context
 *
 * Use this when you don't have full context available.
 * Provides reasonable defaults.
 */
export async function quickHumanize(
  text: string,
  personaId: string,
  turnNumber?: number
): Promise<string> {
  const context: BehaviorSelectionContext = {
    personaId,
    emotional: {},
    content: {},
    turnNumber,
  };

  const result = await humanizeSpeech(text, context);
  return result.text;
}

/**
 * Synchronous humanization for use in sync code paths.
 *
 * IMPORTANT: Call preloadAllSpeechProfiles() at startup to enable sync access.
 * If profiles aren't preloaded, this returns the text unchanged.
 *
 * This is optimized for the persona-fingerprints sync pipeline.
 */
export function quickHumanizeSync(
  text: string,
  personaId: string,
  context?: {
    emotion?: string;
    isQuestion?: boolean;
    isCelebration?: boolean;
    isComforting?: boolean;
    turnNumber?: number;
    randomSeed?: string;
  }
): string {
  // Skip for very short responses
  if (text.length < 20) {
    return text;
  }

  // Check if profiles are preloaded
  if (!areSpeechProfilesPreloaded()) {
    log.debug({ personaId }, 'Speech profiles not preloaded, skipping sync humanization');
    return text;
  }

  const config = getInjectionConfig(personaId);

  // Calculate injection probability
  const turnModifier = Math.min(1, (context?.turnNumber || 1) * config.turnMultiplier);
  const finalProbability = Math.min(config.baseProbability + turnModifier, 0.4);

  // Random check
  const shouldHumanize = context?.randomSeed
    ? hashCode(context.randomSeed) % 100 < finalProbability * 100
    : Math.random() < finalProbability;

  if (!shouldHumanize) {
    return text;
  }

  // Build context
  const selectionContext: BehaviorSelectionContext = {
    personaId,
    emotional: {
      userEmotion: mapEmotionToUserEmotion(context?.emotion),
      agentTone: mapEmotionToAgentTone(context?.emotion),
      isVulnerable: context?.isComforting,
    },
    content: {
      isQuestion: context?.isQuestion,
      isCelebration: context?.isCelebration,
      isComforting: context?.isComforting,
    },
    turnNumber: context?.turnNumber,
    randomSeed: context?.randomSeed,
  };

  let result = text;

  try {
    // Try to add a thinking sound at the start
    if (shouldAddThinkingSound(selectionContext)) {
      const thinkingSound = selectThinkingSoundSync(personaId, selectionContext);
      if (thinkingSound) {
        result = `${thinkingSound.phrase} ${result}`;
        log.debug({ personaId, category: thinkingSound.category }, 'Added sync thinking sound');
      }
    }

    // Try to add an imperfection
    for (const category of config.preferredCategories) {
      if (config.avoidCategories.includes(category)) continue;

      const imperfection = selectImperfectionSync(personaId, category, selectionContext);
      if (imperfection) {
        result = injectBehavior(result, imperfection, config.minCharsBetweenInjections);
        log.debug({ personaId, category }, 'Added sync imperfection');
        break; // Only add one imperfection in sync mode
      }
    }

    // Try to add a breath sound (for vulnerable/grounding moments)
    if (shouldAddBreathSound(selectionContext)) {
      const breathSound = selectBreathSoundSync(personaId, selectionContext);
      if (breathSound) {
        result = `${breathSound.phrase} ${result}`;
        log.debug({ personaId, category: breathSound.category }, 'Added sync breath sound');
      }
    }

    // Try to add laughter contagion (celebration context)
    if (context?.isCelebration) {
      const extendedContext = selectionContext as BehaviorSelectionContext & { userLaughed?: boolean };
      const laughter = selectLaughterResponseSync(personaId, extendedContext);
      if (laughter) {
        result = `${laughter.phrase} ${result}`;
        log.debug({ personaId }, 'Added sync laughter contagion');
      }
    }
  } catch (error) {
    log.warn({ personaId, error: String(error) }, 'Sync humanization failed (non-blocking)');
  }

  return result;
}

/**
 * Map emotion string to user emotion type (for sync context)
 */
function mapEmotionToUserEmotion(
  emotion?: string
): 'distressed' | 'excited' | 'sad' | 'angry' | 'neutral' | 'reflective' | 'anxious' | undefined {
  if (!emotion) return undefined;
  switch (emotion.toLowerCase()) {
    case 'distressed':
    case 'stressed':
      return 'distressed';
    case 'excited':
    case 'happy':
      return 'excited';
    case 'sad':
    case 'sympathetic':
      return 'sad';
    case 'angry':
    case 'frustrated':
      return 'angry';
    case 'neutral':
      return 'neutral';
    case 'reflective':
    case 'contemplative':
      return 'reflective';
    case 'anxious':
    case 'worried':
      return 'anxious';
    default:
      return undefined;
  }
}

/**
 * Map emotion string to agent tone (for sync context)
 */
function mapEmotionToAgentTone(
  emotion?: string
): 'celebratory' | 'supportive' | 'curious' | 'serious' | 'playful' | 'grounding' | undefined {
  if (!emotion) return undefined;
  switch (emotion.toLowerCase()) {
    case 'sympathetic':
    case 'comforting':
    case 'affectionate':
    case 'warm':
      return 'supportive';
    case 'excited':
    case 'happy':
    case 'celebratory':
      return 'celebratory';
    case 'calm':
    case 'grounding':
      return 'grounding';
    case 'curious':
    case 'contemplative':
      return 'curious';
    case 'serious':
    case 'concerned':
      return 'serious';
    case 'playful':
    case 'joking':
      return 'playful';
    default:
      return undefined;
  }
}

/**
 * Get all available imperfection categories for a persona
 */
export async function getAvailableCategories(
  personaId: string
): Promise<ImperfectionCategory[]> {
  const profile = await loadSpeechProfile(personaId);

  if (!profile.imperfections) {
    return [];
  }

  const categories: ImperfectionCategory[] = [];
  const schema = profile.imperfections;

  // Check which categories have content
  const categoryKeys: CoreImperfectionCategory[] = [
    'trailing_off',
    'self_corrections',
    'restarts',
    'filler_sounds',
    'thinking_aloud',
  ];

  for (const key of categoryKeys) {
    const phrases = schema[key];
    if (Array.isArray(phrases) && phrases.length > 0) {
      categories.push(key);
    }
  }

  // Check extended categories
  const extendedKeys = [
    'excitement_overflow',
    'celebration_overflow',
    'genuine_processing',
    'efficient_processing',
    'contemplative_sounds',
    'empathy_sounds',
    'grounding_sounds',
    'overwhelm_support',
    'wisdom_building',
    'gentle_laughter',
    'presence_sounds',
  ] as const;

  for (const key of extendedKeys) {
    const phrases = schema[key as keyof typeof schema];
    if (Array.isArray(phrases) && phrases.length > 0) {
      categories.push(key as ImperfectionCategory);
    }
  }

  return categories;
}

// =============================================================================
// EXPORTS
// =============================================================================

export { loadSpeechProfile, clearSpeechProfileCache, preloadAllSpeechProfiles } from './behavior-loader.js';
export type {
  BehaviorSelectionContext,
  SelectedBehavior,
  HumanizedSpeechResult,
  ImperfectionCategory,
  PersonaSpeechProfile,
} from './types.js';

