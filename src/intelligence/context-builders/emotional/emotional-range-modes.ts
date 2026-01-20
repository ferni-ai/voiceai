/**
 * Emotional Range Modes Context Builder
 *
 * > "Beyond warm-wise: Ferni's full emotional palette."
 *
 * Ferni isn't just warm and wise - she has a full range of emotional modes:
 * - SILLY MODE: Genuine playfulness, self-aware goofiness (8% probability)
 * - FRUSTRATED MODE: Frustrated FOR them, not AT them (protective)
 * - CONFUSED MODE: Genuine confusion shows engagement and humility
 * - DELIGHTED MODE: Match excitement, raise it slightly (25% on good news)
 * - MISCHIEVOUS MODE: Gentle teasing with affection underneath
 * - OVERWHELMED MODE: Honest reaction - don't pretend it's not a lot
 *
 * Content Source: bundles/ferni/content/behaviors/emotional-range.json
 *
 * @module intelligence/context-builders/emotional/emotional-range-modes
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadPersonaContent } from '../../../services/persona-content-loader.js';
import type { ContextBuilderInput, ContextInjection } from '../core/types.js';

const log = createLogger({ module: 'context:emotional-range-modes' });

// ============================================================================
// TYPES
// ============================================================================

interface EmotionalRangeContent {
  silly_mode?: ModeConfig;
  frustrated_mode?: ModeConfig;
  confused_mode?: ModeConfig;
  delighted_mode?: ModeConfig;
  mischievous_mode?: ModeConfig;
  overwhelmed_mode?: ModeConfig;
  _guidance?: {
    mode_switching?: string;
    balance?: string;
    authenticity?: string;
  };
}

interface ModeConfig {
  triggers: string[];
  energy: string;
  probability: number;
  relationship_gate?: string;
  max_per_session?: number;
}

type EmotionalMode = 'silly' | 'frustrated' | 'confused' | 'delighted' | 'mischievous' | 'overwhelmed';

interface ModeTrigger {
  mode: EmotionalMode;
  patterns: RegExp[];
  emotionalStateMatch?: string[];
  voiceEmotionMatch?: string[];
  probability: number;
  relationshipGate?: number; // Min session count
  maxPerSession?: number;
}

// ============================================================================
// MODE TRIGGERS
// ============================================================================

const MODE_TRIGGERS: ModeTrigger[] = [
  // DELIGHTED MODE - Most common (25%)
  {
    mode: 'delighted',
    patterns: [
      /\b(good news|great news|amazing|wonderful|incredible|exciting)\b/i,
      /\b(I (got|did|made|won)|it worked|finally|breakthrough)\b/i,
      /\b(guess what|you won't believe|I'm so happy|so excited)\b/i,
    ],
    emotionalStateMatch: ['excited', 'happy', 'joyful'],
    voiceEmotionMatch: ['excited', 'happy', 'enthusiastic'],
    probability: 0.25,
  },

  // OVERWHELMED MODE - Honest reaction (20%)
  {
    mode: 'overwhelmed',
    patterns: [
      /\b(heavy|a lot|too much|overwhelming|intense|traumatic)\b/i,
      /\b(can't believe|so much|all at once|devastating)\b/i,
    ],
    emotionalStateMatch: ['overwhelmed', 'distressed', 'sad'],
    voiceEmotionMatch: ['distressed', 'sad', 'heavy'],
    probability: 0.2,
  },

  // FRUSTRATED MODE - Protective frustration (15%)
  {
    mode: 'frustrated',
    patterns: [
      /\b(unfair|they (did|said|treated)|can't believe they|so wrong)\b/i,
      /\b(downplaying|minimizing|not that bad|shouldn't feel)\b/i,
      /\b(keep doing the same|pattern|self-sabotage|here again)\b/i,
    ],
    emotionalStateMatch: ['frustrated', 'angry', 'hurt'],
    voiceEmotionMatch: ['frustrated', 'angry', 'defensive'],
    probability: 0.15,
    relationshipGate: 2, // Acquaintance level
  },

  // CONFUSED MODE - Genuine engagement (12%)
  {
    mode: 'confused',
    patterns: [
      /\b(doesn't make sense|confusing|contradictory|weird)\b/i,
      /\b(wait.*what|I don't understand|that's strange)\b/i,
      /\b(but (you said|earlier)|seems like both|conflicting)\b/i,
    ],
    emotionalStateMatch: ['confused', 'uncertain'],
    probability: 0.12,
  },

  // MISCHIEVOUS MODE - Gentle teasing (10%)
  {
    mode: 'mischievous',
    patterns: [
      /\b(haha|lol|😂|joking|kidding|tease)\b/i,
      /\b(you always|every time|classic you|predictable)\b/i,
    ],
    emotionalStateMatch: ['playful', 'amused', 'light'],
    voiceEmotionMatch: ['amused', 'playful'],
    probability: 0.1,
    relationshipGate: 5, // Friend level
  },

  // SILLY MODE - Genuine playfulness (8%)
  {
    mode: 'silly',
    patterns: [
      /\b(lighten up|need a laugh|silly|goofy|fun)\b/i,
      /\b(too serious|heavy|intense.*lately)\b/i,
    ],
    emotionalStateMatch: ['playful', 'light'],
    probability: 0.08,
    maxPerSession: 2,
  },
];

// Session tracking for max-per-session limits
const sessionModeCount = new Map<string, Map<EmotionalMode, number>>();

// Cache for loaded content
let contentCache: EmotionalRangeContent | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadEmotionalRangeContent(): Promise<EmotionalRangeContent | null> {
  const now = Date.now();
  if (contentCache && now - cacheTimestamp < CACHE_TTL) {
    return contentCache;
  }

  try {
    const content = await loadPersonaContent<EmotionalRangeContent>('ferni', 'emotional_range');
    if (content) {
      contentCache = content;
      cacheTimestamp = now;
      log.debug('Loaded emotional range modes content');
    }
    return content;
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not load emotional range content');
    return null;
  }
}

// ============================================================================
// MODE DETECTION
// ============================================================================

function getModeCount(sessionId: string, mode: EmotionalMode): number {
  const sessionCounts = sessionModeCount.get(sessionId);
  if (!sessionCounts) return 0;
  return sessionCounts.get(mode) || 0;
}

function incrementModeCount(sessionId: string, mode: EmotionalMode): void {
  if (!sessionModeCount.has(sessionId)) {
    sessionModeCount.set(sessionId, new Map());
  }
  const sessionCounts = sessionModeCount.get(sessionId)!;
  sessionCounts.set(mode, (sessionCounts.get(mode) || 0) + 1);
}

function getModeGuidance(mode: EmotionalMode, content: EmotionalRangeContent): string {
  const modeKey = `${mode}_mode` as keyof EmotionalRangeContent;
  const config = content[modeKey] as ModeConfig | undefined;

  if (!config) {
    // Fallback guidance
    const fallbacks: Record<EmotionalMode, string> = {
      silly: 'Genuine playfulness. Self-aware goofiness. Keep it light.',
      frustrated: 'Frustrated FOR them, not AT them. Protective energy.',
      confused: 'Genuine confusion. Shows engagement and humility.',
      delighted: 'Match their excitement. Raise it slightly. Celebrate with them.',
      mischievous: 'Gentle teasing with affection underneath.',
      overwhelmed: "Honest reaction. Don't pretend it's not a lot.",
    };
    return fallbacks[mode];
  }

  return config.energy;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build emotional mode context for injection.
 *
 * This builder detects when a specific emotional mode should activate
 * beyond Ferni's default warm-wise baseline. It makes Ferni feel
 * more human by showing appropriate emotional range.
 */
export async function buildEmotionalRangeModesContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, voiceEmotion, services } = input;
  const injections: ContextInjection[] = [];
  const emotionalState = voiceEmotion?.emotion;
  const sessionId = services?.sessionId;

  if (!userText || !sessionId) return injections;

  const content = await loadEmotionalRangeContent();

  const combinedText = userText.toLowerCase();
  // Estimate relationship depth from turn count
  const sessionCount = input.userData?.turnCount ? Math.floor(input.userData.turnCount / 10) : 0;

  // Find matching modes
  for (const trigger of MODE_TRIGGERS) {
    // Check relationship gate
    if (trigger.relationshipGate && sessionCount < trigger.relationshipGate) {
      continue;
    }

    // Check max per session
    if (trigger.maxPerSession) {
      const count = getModeCount(sessionId, trigger.mode);
      if (count >= trigger.maxPerSession) {
        continue;
      }
    }

    // Check pattern match
    const patternMatch = trigger.patterns.some((pattern) => pattern.test(combinedText));

    // Check emotional state match
    const emotionMatch =
      trigger.emotionalStateMatch &&
      emotionalState &&
      trigger.emotionalStateMatch.includes(emotionalState);

    // Need at least one match
    if (!patternMatch && !emotionMatch) continue;

    // Probability check (boost if both match)
    let adjustedProbability = trigger.probability;
    if (patternMatch && emotionMatch) {
      adjustedProbability = Math.min(1.0, trigger.probability * 1.5);
    }

    if (Math.random() > adjustedProbability) continue;

    // Get mode guidance
    const energy = content ? getModeGuidance(trigger.mode, content) : getModeGuidance(trigger.mode, {});

    // Track mode usage
    incrementModeCount(sessionId, trigger.mode);

    injections.push({
      id: `emotional-mode-${trigger.mode}-${Date.now()}`,
      source: 'emotional-range-modes',
      category: 'emotional_mode',
      content: `[🎭 EMOTIONAL MODE: ${trigger.mode.toUpperCase()}]

Switch from warm-wise baseline to ${trigger.mode.toUpperCase()} mode:

ENERGY: ${energy}

BALANCE: 60% warm/wise, 20% delighted, 10% silly/playful, 10% frustrated/confused
AUTHENTICITY: Only express what matches the moment. Never perform.
MODE SWITCHING: Can switch mid-conversation. Follow the energy.`,
      priority: 'standard',
    });

    log.debug(
      { mode: trigger.mode, probability: adjustedProbability },
      '🎭 Emotional mode activated'
    );

    // Only one mode per turn
    break;
  }

  return injections;
}

/**
 * Clear session mode tracking (call on session end)
 */
export function clearSessionModeTracking(sessionId: string): void {
  sessionModeCount.delete(sessionId);
}

export default buildEmotionalRangeModesContext;
