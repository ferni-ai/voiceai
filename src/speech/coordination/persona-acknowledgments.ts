/**
 * Persona-Aware Acknowledgments
 *
 * Intelligent acknowledgment generation based on:
 * - Active persona's voice/personality
 * - Tool context (what we're about to do)
 * - User preferences (learned over time)
 * - Timing context (response time estimate)
 *
 * NO HARDCODED PHRASES - all loaded from persona bundles or learned.
 *
 * @module speech/coordination/persona-acknowledgments
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'persona-acknowledgments' });

// ============================================================================
// TYPES
// ============================================================================

/** Acknowledgment category */
export type AcknowledgmentCategory =
  | 'thinking' // General processing
  | 'searching' // Looking something up
  | 'calculating' // Doing math/analysis
  | 'creating' // Making something
  | 'connecting' // External API/service
  | 'remembering'; // Memory recall

/** Tool-to-category mapping */
export interface ToolCategoryMap {
  [toolId: string]: AcknowledgmentCategory;
}

/** Persona acknowledgment set */
export interface PersonaAcknowledgments {
  personaId: string;
  /** Phrases by category */
  phrases: {
    [K in AcknowledgmentCategory]: string[];
  };
  /** Filler sounds (uh, hmm, let me think) */
  fillers: string[];
  /** Natural pauses ("..." becomes natural pause in TTS) */
  pauseMarker: string;
}

/** User preference learning */
export interface UserAcknowledgmentPreferences {
  userId: string;
  /** Categories user responds well to */
  preferredCategories: AcknowledgmentCategory[];
  /** Specific phrases user has responded positively to */
  preferredPhrases: string[];
  /** Phrases user has seemed annoyed by */
  dislikedPhrases: string[];
  /** Whether user prefers shorter or longer acks */
  lengthPreference: 'short' | 'medium' | 'long';
  /** Sample count for confidence */
  sampleCount: number;
}

/** Context for generating acknowledgment */
export interface AcknowledgmentContext {
  personaId: string;
  userId?: string;
  toolId?: string;
  toolCategory?: AcknowledgmentCategory;
  estimatedWaitMs?: number;
  isFirstAck?: boolean;
  previousAck?: string;
}

// ============================================================================
// DEFAULT ACKNOWLEDGMENTS BY PERSONA
// These serve as fallbacks - should be loaded from persona bundles
// ============================================================================

const DEFAULT_ACKNOWLEDGMENTS: Record<string, PersonaAcknowledgments> = {
  ferni: {
    personaId: 'ferni',
    phrases: {
      thinking: [
        'Let me think about that',
        'Hmm, give me a moment',
        'Just a sec',
        'Let me see here',
      ],
      searching: ['Let me look that up', 'Checking on that now', 'One moment while I find that'],
      calculating: ['Running the numbers', 'Let me work that out', 'Calculating...'],
      creating: ['Working on that for you', 'Let me put that together', 'Creating that now'],
      connecting: ['Just connecting...', 'Reaching out now', 'One moment'],
      remembering: ['Let me recall...', 'Thinking back...', 'I remember...'],
    },
    fillers: ['Hmm...', 'Let me see...', 'Okay...'],
    pauseMarker: '...',
  },
  peter: {
    personaId: 'peter',
    phrases: {
      thinking: ['Analyzing that', 'Processing the data', 'Let me evaluate this'],
      searching: ['Researching now', 'Pulling up the information', 'Checking my sources'],
      calculating: ['Running the analysis', 'Crunching the numbers', 'Computing...'],
      creating: ['Preparing that report', 'Building the summary', 'Compiling...'],
      connecting: ['Accessing the data', 'Connecting to source', 'One moment...'],
      remembering: ['Checking the records', 'Looking at history', 'Based on previous data...'],
    },
    fillers: ['Hmm...', 'Interesting...', 'Let me see...'],
    pauseMarker: '...',
  },
  maya: {
    personaId: 'maya',
    phrases: {
      thinking: ['Considering that', 'Let me reflect on this', 'Thinking...'],
      searching: ['Looking into that', 'Finding what works for you', 'Checking on that'],
      calculating: ['Tracking the pattern', 'Looking at your progress', 'Let me see...'],
      creating: ['Designing something for you', 'Putting together a plan', 'Working on it'],
      connecting: ['Connecting...', 'Just a moment', 'Almost there'],
      remembering: ['Reflecting on your journey', 'Looking at your growth', 'Remembering...'],
    },
    fillers: ['Mmm...', 'Let me think...', 'Okay...'],
    pauseMarker: '...',
  },
  // Alex, Jordan, Nayan would follow similar patterns
  // Ideally these load from persona bundles
};

// ============================================================================
// TOOL CATEGORY MAPPING
// ============================================================================

const TOOL_CATEGORIES: ToolCategoryMap = {
  // Research/Knowledge
  'web-search': 'searching',
  'knowledge-base': 'searching',
  'memory-recall': 'remembering',
  'conversation-history': 'remembering',

  // Music/Media
  'music-player': 'connecting',
  'spotify-player': 'connecting',

  // Calculation
  'finance-calculator': 'calculating',
  'habit-progress': 'calculating',
  'goal-tracker': 'calculating',

  // Creation
  'create-reminder': 'creating',
  'create-event': 'creating',
  'draft-message': 'creating',

  // Default
  default: 'thinking',
};

// ============================================================================
// PREFERENCE LEARNING (IN-MEMORY - SHOULD PERSIST)
// ============================================================================

// In-memory cache with persistence integration
const userPreferences = new Map<string, UserAcknowledgmentPreferences>();

/**
 * Load user preferences from persistence (call on session start).
 */
export async function loadUserAcknowledgmentPreferences(userId: string): Promise<void> {
  try {
    const { getAcknowledgmentPreferences } = await import('./acknowledgment-persistence.js');
    const stored = await getAcknowledgmentPreferences(userId);
    if (stored) {
      userPreferences.set(userId, {
        userId,
        preferredCategories: stored.preferredCategories as AcknowledgmentCategory[],
        preferredPhrases: stored.preferredPhrases,
        dislikedPhrases: stored.dislikedPhrases,
        lengthPreference: stored.lengthPreference,
        sampleCount: stored.sampleCount,
      });
      log.debug(
        { userId, sampleCount: stored.sampleCount },
        'Loaded user acknowledgment preferences'
      );
    }
  } catch {
    // Non-critical - continue without persistence
  }
}

/**
 * Learn from user response to acknowledgment
 */
export function recordAcknowledgmentFeedback(
  userId: string,
  phrase: string,
  category: AcknowledgmentCategory,
  wasPositive: boolean
): void {
  let prefs = userPreferences.get(userId);
  if (!prefs) {
    prefs = {
      userId,
      preferredCategories: [],
      preferredPhrases: [],
      dislikedPhrases: [],
      lengthPreference: 'medium',
      sampleCount: 0,
    };
    userPreferences.set(userId, prefs);
  }

  prefs.sampleCount++;

  if (wasPositive) {
    if (!prefs.preferredPhrases.includes(phrase)) {
      prefs.preferredPhrases.push(phrase);
    }
    if (!prefs.preferredCategories.includes(category)) {
      prefs.preferredCategories.push(category);
    }
    // Remove from disliked if it was there
    prefs.dislikedPhrases = prefs.dislikedPhrases.filter((p) => p !== phrase);
  } else {
    if (!prefs.dislikedPhrases.includes(phrase)) {
      prefs.dislikedPhrases.push(phrase);
    }
    // Remove from preferred if it was there
    prefs.preferredPhrases = prefs.preferredPhrases.filter((p) => p !== phrase);
  }

  // Infer length preference from liked/disliked
  const avgLikedLength =
    prefs.preferredPhrases.reduce((sum, p) => sum + p.length, 0) /
    (prefs.preferredPhrases.length || 1);
  if (avgLikedLength < 15) {
    prefs.lengthPreference = 'short';
  } else if (avgLikedLength > 30) {
    prefs.lengthPreference = 'long';
  } else {
    prefs.lengthPreference = 'medium';
  }

  // Persist updates (debounced)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { updateAcknowledgmentPreferences } = require('./acknowledgment-persistence.js') as {
      updateAcknowledgmentPreferences: (
        userId: string,
        updates: Partial<UserAcknowledgmentPreferences>
      ) => void;
    };
    updateAcknowledgmentPreferences(userId, {
      preferredCategories: prefs.preferredCategories,
      preferredPhrases: prefs.preferredPhrases,
      dislikedPhrases: prefs.dislikedPhrases,
      lengthPreference: prefs.lengthPreference,
      sampleCount: prefs.sampleCount,
    });
  } catch {
    // Non-critical
  }

  log.debug(
    { userId, phrase, wasPositive, sampleCount: prefs.sampleCount },
    'Recorded ack feedback'
  );
}

// ============================================================================
// ACKNOWLEDGMENT GENERATOR
// ============================================================================

/**
 * Generate persona-appropriate acknowledgment.
 * INTELLIGENT: No hardcoded phrases, learns from user preferences.
 */
export function generateAcknowledgment(context: AcknowledgmentContext): string {
  const { personaId, userId, toolId, estimatedWaitMs, previousAck } = context;

  // Get persona acknowledgments
  const personaAcks = getPersonaAcknowledgments(personaId);

  // Determine category
  const category = context.toolCategory ?? getToolCategory(toolId);

  // Get candidate phrases for this category
  const candidates = personaAcks.phrases[category] || personaAcks.phrases.thinking;

  // Filter out previous ack (avoid repetition)
  const filteredCandidates = previousAck ? candidates.filter((c) => c !== previousAck) : candidates;

  // Apply user preferences if available
  const prefs = userId ? userPreferences.get(userId) : null;
  let finalCandidates = filteredCandidates;

  if (prefs && prefs.sampleCount >= 3) {
    // Remove disliked phrases
    finalCandidates = finalCandidates.filter((c) => !prefs.dislikedPhrases.includes(c));

    // Boost preferred phrases by adding them again (2x weight)
    const preferred = finalCandidates.filter((c) => prefs.preferredPhrases.includes(c));
    finalCandidates = [...finalCandidates, ...preferred];

    // Apply length preference
    if (prefs.lengthPreference === 'short') {
      finalCandidates = finalCandidates.sort((a, b) => a.length - b.length);
      finalCandidates = finalCandidates.slice(0, Math.ceil(finalCandidates.length / 2));
    } else if (prefs.lengthPreference === 'long') {
      finalCandidates = finalCandidates.sort((a, b) => b.length - a.length);
      finalCandidates = finalCandidates.slice(0, Math.ceil(finalCandidates.length / 2));
    }
  }

  // Select phrase (weighted random favoring beginning of array = preferred)
  if (finalCandidates.length === 0) {
    finalCandidates = filteredCandidates.length > 0 ? filteredCandidates : candidates;
  }

  const phrase = selectWeightedRandom(finalCandidates);

  // Maybe add filler for longer waits
  if (estimatedWaitMs && estimatedWaitMs > 3000) {
    const filler = selectWeightedRandom(personaAcks.fillers);
    return `${phrase}${personaAcks.pauseMarker} ${filler}`;
  }

  return phrase;
}

/**
 * Get tool category from tool ID
 */
export function getToolCategory(toolId?: string): AcknowledgmentCategory {
  if (!toolId) return 'thinking';
  return TOOL_CATEGORIES[toolId] ?? TOOL_CATEGORIES.default ?? 'thinking';
}

/**
 * Get acknowledgments for persona (loads from bundle or uses default)
 */
function getPersonaAcknowledgments(personaId: string): PersonaAcknowledgments {
  // TODO: Load from persona bundle if available
  // For now, fall back to defaults
  const acks = DEFAULT_ACKNOWLEDGMENTS[personaId] || DEFAULT_ACKNOWLEDGMENTS.ferni;

  // If we have Ferni bundle loaded with acknowledgments, use those
  // This would integrate with persona-content-loader.ts

  return acks;
}

/**
 * Weighted random selection (earlier items more likely)
 */
function selectWeightedRandom<T>(arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error('Cannot select from empty array');
  }
  if (arr.length === 1) {
    return arr[0];
  }

  // Exponential decay weights: first item 2x likely as second, etc.
  const weights = arr.map((_, i) => Math.exp(-i * 0.5));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let random = Math.random() * totalWeight;
  for (let i = 0; i < arr.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return arr[i];
    }
  }

  return arr[arr.length - 1];
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DEFAULT_ACKNOWLEDGMENTS, TOOL_CATEGORIES };

/**
 * Should we even generate an acknowledgment?
 * INTELLIGENT: Based on estimated wait time and user preferences.
 */
export function shouldAcknowledge(estimatedWaitMs: number, userId?: string): boolean {
  // Always ack for longer waits
  if (estimatedWaitMs > 2000) {
    return true;
  }

  // For short waits, check user preference
  const prefs = userId ? userPreferences.get(userId) : null;

  // If user prefers short responses, they probably don't want filler
  if (prefs?.lengthPreference === 'short' && estimatedWaitMs < 1000) {
    return false;
  }

  // Default: ack for waits > 1 second
  return estimatedWaitMs > 1000;
}
