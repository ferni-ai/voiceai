/**
 * Speech Humanizer
 *
 * Injects persona-specific speech imperfections, thinking sounds, breaths
 * and callbacks into text, synchronously from preloaded profiles.
 *
 * Reached via applyPersonaSpeechTraitsSync (adaptive-ssml alive-voice), which
 * the greeting tagger uses. Nothing on the live path loads the profiles yet,
 * so today it returns the text unchanged. The async post-LLM entry points were
 * written for the removed response processor and never ran on calls.
 *
 * @module speech/humanization/speech-humanizer
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getInjectionConfig,
  areSpeechProfilesPreloaded,
  selectThinkingSoundSync,
  selectImperfectionSync,
  selectBreathSoundSync,
  selectLaughterResponseSync,
} from './behavior-loader.js';
import { detectCallbackTriggers, selectCallback, injectCallback } from './callback-detector.js';
import type { BehaviorSelectionContext, SelectedBehavior } from './types.js';

const log = createLogger({ module: 'SpeechHumanizer' });

// =============================================================================
// INJECTION LOGIC
// =============================================================================

/**
 * Inject a behavior into text at the appropriate position
 */
function injectBehavior(text: string, behavior: SelectedBehavior, minCharsBetween: number): string {
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
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

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
    /** User's original message (for callback detection) */
    userText?: string;
    /** Total conversation count with this user */
    conversationCount?: number;
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
    userText: context?.userText,
    conversationCount: context?.conversationCount,
  };

  let result = text;

  try {
    // Try to add callback (relationship continuity)
    // This happens first because it should precede other humanization
    if (context?.userText && context?.conversationCount !== undefined) {
      const triggers = detectCallbackTriggers(context.userText, personaId);
      if (triggers.length > 0) {
        const callback = selectCallback(triggers, personaId, context.conversationCount);
        if (callback) {
          result = injectCallback(result, callback);
          log.debug({ personaId, callbackId: callback.id }, 'Added sync callback');
        }
      }
    }

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
      const extendedContext = selectionContext as BehaviorSelectionContext & {
        userLaughed?: boolean;
      };
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

// =============================================================================
// EXPORTS
// =============================================================================

export {
  loadSpeechProfile,
  clearSpeechProfileCache,
  preloadAllSpeechProfiles,
} from './behavior-loader.js';
export type {
  BehaviorSelectionContext,
  SelectedBehavior,
  ImperfectionCategory,
  PersonaSpeechProfile,
} from './types.js';
