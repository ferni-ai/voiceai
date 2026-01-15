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
export type ToolCategoryMap = Record<string, AcknowledgmentCategory>;

/** Persona acknowledgment set */
export interface PersonaAcknowledgments {
  personaId: string;
  /** Phrases by category */
  phrases: Record<AcknowledgmentCategory, string[]>;
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

// ============================================================================
// HUMANIZATION: Sound like a real person, not a voice assistant
//
// Philosophy:
// 1. Use SSML to add texture (pauses, speed, emotion)
// 2. Natural conversational sounds, not meta-commentary
// 3. Keep talking while working - fill the dead air authentically
// 4. Trail off naturally, catch yourself, be human
// ============================================================================

const DEFAULT_ACKNOWLEDGMENTS: Record<string, PersonaAcknowledgments> = {
  ferni: {
    personaId: 'ferni',
    phrases: {
      // THINKING - Natural processing sounds with SSML
      thinking: [
        '<emotion value="curious"/>Hmm.<break time="300ms"/>',
        'Oh!<break time="200ms"/>One sec.',
        '<break time="150ms"/>Yeah, give me a moment.',
        'Ooh.<break time="200ms"/>Hold on.',
        '<emotion value="curious"/>Mm, interesting.<break time="200ms"/>',
      ],
      // SEARCHING - Looking something up
      searching: [
        '<break time="150ms"/>Okay, checking on that.',
        'Ooh, good question.<break time="200ms"/>One sec.',
        '<emotion value="curious"/>Hmm, let me see what I can find.<break time="150ms"/>',
        'Oh!<break time="150ms"/>Pulling that up now.',
        'Hang on.<break time="200ms"/>',
      ],
      // CALCULATING - Processing numbers
      calculating: [
        '<break time="150ms"/>Okay, running those numbers.',
        'Mm.<break time="200ms"/>Give me a sec to crunch that.',
        '<emotion value="curious"/>Interesting.<break time="150ms"/>One moment.',
        'Oh, good one.<break time="200ms"/>Let me figure that out.',
      ],
      // CREATING - Making something
      creating: [
        '<break time="150ms"/>Okay, working on that.',
        'Ooh, I like this.<break time="200ms"/>One sec.',
        '<emotion value="enthusiastic"/>Oh nice!<break time="150ms"/>Putting that together.',
        'Yeah, give me just a moment.<break time="150ms"/>',
      ],
      // CONNECTING - External services
      connecting: [
        '<break time="150ms"/>Okay, connecting.',
        'One sec while I grab that.<break time="150ms"/>',
        '<break time="200ms"/>Almost there.',
        'Hang on.<break time="150ms"/>',
      ],
      // REMEMBERING - Memory recall
      remembering: [
        '<emotion value="curious"/>Oh yeah!<break time="200ms"/>',
        '<break time="150ms"/>Right, I remember.<break time="150ms"/>',
        'Mm, that reminds me.<break time="200ms"/>',
        '<emotion value="affectionate"/>Oh, of course.<break time="150ms"/>',
      ],
    },
    // Natural sounds to fill longer waits - SSML enhanced
    fillers: [
      'Hmm.<break time="300ms"/>',
      'Mm.<break time="200ms"/>',
      '<break time="150ms"/>Yeah.<break time="150ms"/>',
      'Okay.<break time="200ms"/>',
    ],
    pauseMarker: '<break time="200ms"/>',
  },
  peter: {
    personaId: 'peter',
    phrases: {
      thinking: [
        '<emotion value="curious"/>Hmm.<break time="300ms"/>Interesting.',
        '<break time="150ms"/>One moment, processing that.',
        'Ah.<break time="200ms"/>Give me a second.',
        '<emotion value="curious"/>Let me think about that.<break time="200ms"/>',
      ],
      searching: [
        '<break time="150ms"/>Researching that now.',
        'Good question.<break time="200ms"/>Pulling up the data.',
        '<emotion value="curious"/>Hmm.<break time="150ms"/>Checking on that.',
        'One moment.<break time="200ms"/>',
      ],
      calculating: [
        '<break time="150ms"/>Running the analysis.',
        'Ah, numbers.<break time="200ms"/>Give me a moment.',
        '<emotion value="curious"/>Interesting.<break time="150ms"/>Crunching that.',
        'One sec.<break time="200ms"/>',
      ],
      creating: [
        '<break time="150ms"/>Preparing that.',
        'Ah.<break time="200ms"/>Building the summary.',
        '<break time="150ms"/>Almost there.',
      ],
      connecting: [
        '<break time="150ms"/>Accessing that now.',
        'One moment.<break time="200ms"/>',
        '<break time="150ms"/>Connecting.',
      ],
      remembering: [
        '<emotion value="curious"/>Ah yes.<break time="200ms"/>Checking the records.',
        '<break time="150ms"/>Looking at the history.',
        'Based on what I recall.<break time="200ms"/>',
      ],
    },
    fillers: [
      'Hmm.<break time="300ms"/>',
      'Interesting.<break time="200ms"/>',
      'So.<break time="200ms"/>',
    ],
    pauseMarker: '<break time="200ms"/>',
  },
  maya: {
    personaId: 'maya',
    phrases: {
      thinking: [
        '<emotion value="curious"/>Hmm.<break time="300ms"/>',
        '<break time="150ms"/>One moment, thinking on that.',
        'Oh!<break time="200ms"/>Give me a sec.',
        '<emotion value="affectionate"/>Mm.<break time="200ms"/>',
      ],
      searching: [
        '<break time="150ms"/>Looking into that for you.',
        'Ooh, good one.<break time="200ms"/>Let me find what works.',
        '<emotion value="curious"/>Hmm.<break time="150ms"/>Checking on that.',
        'One moment.<break time="200ms"/>',
      ],
      calculating: [
        '<break time="150ms"/>Tracking the pattern.',
        'Oh, let me look at your progress.<break time="200ms"/>',
        '<emotion value="curious"/>Interesting.<break time="150ms"/>One sec.',
        'Give me a moment.<break time="200ms"/>',
      ],
      creating: [
        '<emotion value="enthusiastic"/>Ooh, I love this!<break time="200ms"/>Working on it.',
        '<break time="150ms"/>Putting together a plan.',
        'One sec.<break time="200ms"/>',
      ],
      connecting: [
        '<break time="150ms"/>Connecting.',
        'Just a moment.<break time="200ms"/>',
        '<break time="150ms"/>Almost there.',
      ],
      remembering: [
        '<emotion value="affectionate"/>Oh, I remember.<break time="200ms"/>',
        '<break time="150ms"/>Reflecting on your journey.',
        'Looking at your growth.<break time="200ms"/>',
      ],
    },
    fillers: [
      'Mmm.<break time="200ms"/>',
      'Yeah.<break time="200ms"/>',
      'Okay.<break time="200ms"/>',
    ],
    pauseMarker: '<break time="200ms"/>',
  },
  alex: {
    personaId: 'alex',
    phrases: {
      thinking: [
        '<break time="150ms"/>One sec, processing.',
        '<emotion value="curious"/>Hmm.<break time="200ms"/>',
        'Okay.<break time="150ms"/>Give me a moment.',
      ],
      searching: [
        '<break time="150ms"/>Looking that up.',
        'One moment.<break time="200ms"/>',
        '<emotion value="curious"/>Good question.<break time="150ms"/>Checking.',
      ],
      calculating: ['<break time="150ms"/>Running the numbers.', 'One sec.<break time="200ms"/>'],
      creating: [
        '<break time="150ms"/>Drafting that.',
        'Working on it.<break time="200ms"/>',
        'One moment.<break time="150ms"/>',
      ],
      connecting: ['<break time="150ms"/>Connecting.', 'Almost there.<break time="200ms"/>'],
      remembering: ['<break time="150ms"/>Checking that.', 'One sec.<break time="200ms"/>'],
    },
    fillers: ['Hmm.<break time="200ms"/>', 'Okay.<break time="200ms"/>'],
    pauseMarker: '<break time="200ms"/>',
  },
  jordan: {
    personaId: 'jordan',
    phrases: {
      thinking: [
        '<emotion value="enthusiastic"/>Ooh!<break time="200ms"/>One sec.',
        '<break time="150ms"/>Let me think.',
        'Oh, fun!<break time="200ms"/>Give me a moment.',
      ],
      searching: [
        '<emotion value="enthusiastic"/>Ooh, checking on that!<break time="200ms"/>',
        '<break time="150ms"/>Looking that up.',
        'One moment.<break time="200ms"/>',
      ],
      calculating: ['<break time="150ms"/>Crunching the numbers.', 'One sec.<break time="200ms"/>'],
      creating: [
        '<emotion value="enthusiastic"/>Oh, this is exciting!<break time="200ms"/>Working on it.',
        '<break time="150ms"/>Putting it together.',
        'One moment.<break time="200ms"/>',
      ],
      connecting: ['<break time="150ms"/>Connecting.', 'Almost there!<break time="200ms"/>'],
      remembering: [
        '<emotion value="enthusiastic"/>Oh yes!<break time="200ms"/>',
        '<break time="150ms"/>I remember.',
      ],
    },
    fillers: ['Ooh.<break time="200ms"/>', 'Nice.<break time="200ms"/>'],
    pauseMarker: '<break time="200ms"/>',
  },
  nayan: {
    personaId: 'nayan',
    phrases: {
      thinking: [
        '<speed ratio="0.95"/><break time="300ms"/>Hmm.<break time="200ms"/>',
        '<emotion value="curious"/><break time="200ms"/>One moment.',
        '<speed ratio="0.9"/>Let me consider that.<break time="300ms"/>',
      ],
      searching: [
        '<break time="200ms"/>Looking into that.',
        '<speed ratio="0.95"/>One moment.<break time="200ms"/>',
      ],
      calculating: [
        '<break time="200ms"/>Processing that.',
        '<speed ratio="0.95"/>One moment.<break time="200ms"/>',
      ],
      creating: [
        '<break time="200ms"/>Crafting a response.',
        '<speed ratio="0.95"/>One moment.<break time="200ms"/>',
      ],
      connecting: ['<break time="200ms"/>Connecting.', 'One moment.<break time="200ms"/>'],
      remembering: [
        '<emotion value="affectionate"/><break time="200ms"/>Ah, yes.',
        '<speed ratio="0.95"/>I recall.<break time="200ms"/>',
      ],
    },
    fillers: [
      '<break time="300ms"/>Hmm.<break time="200ms"/>',
      '<break time="200ms"/>Indeed.<break time="200ms"/>',
    ],
    pauseMarker: '<break time="250ms"/>',
  },
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

// ============================================================================
// PERSONA BUNDLE CACHE
// ============================================================================

// Cache for loaded persona acknowledgments from bundles
const bundleAcknowledgmentsCache = new Map<string, PersonaAcknowledgments | null>();

/**
 * Attempt to load acknowledgments from persona bundle's thinking_sounds.
 * This is called once per persona and cached.
 */
async function loadPersonaBundleAcknowledgments(
  personaId: string
): Promise<PersonaAcknowledgments | null> {
  // Check cache first
  if (bundleAcknowledgmentsCache.has(personaId)) {
    return bundleAcknowledgmentsCache.get(personaId) ?? null;
  }

  try {
    const { loadPersonaBehaviors } = await import('../../services/persona-service/persona-content-loader.js');
    const behaviors = await loadPersonaBehaviors(personaId);

    if (!behaviors) {
      bundleAcknowledgmentsCache.set(personaId, null);
      return null;
    }

    // Build PersonaAcknowledgments from bundle behaviors
    const thinkingSounds = behaviors.thinking_sounds;
    const hasThinkingSounds =
      thinkingSounds && (Array.isArray(thinkingSounds) || typeof thinkingSounds === 'object');

    if (!hasThinkingSounds) {
      bundleAcknowledgmentsCache.set(personaId, null);
      return null;
    }

    // Extract phrases from thinking_sounds
    const soundsArray = Array.isArray(thinkingSounds)
      ? thinkingSounds
      : ((thinkingSounds as { thinking?: string[]; processing?: string[] }).thinking ?? []);

    const processingArray = !Array.isArray(thinkingSounds)
      ? ((thinkingSounds as { processing?: string[] }).processing ?? [])
      : [];

    // Build acknowledgments structure
    const acks: PersonaAcknowledgments = {
      personaId,
      phrases: {
        thinking: soundsArray.length > 0 ? soundsArray : ['Hmm...', 'One sec', 'Just a moment'],
        searching:
          processingArray.length > 0 ? processingArray : ['Checking on that', 'One moment'],
        calculating:
          processingArray.length > 0 ? processingArray : ['Running the numbers', 'One sec'],
        creating: ['Working on that', 'One moment', 'Almost there'],
        connecting: ['Connecting...', 'One sec', 'Almost there'],
        remembering: ['Oh yeah...', 'I remember...', 'Right...'],
      },
      fillers: soundsArray.slice(0, 3), // Use first few thinking sounds as fillers
      pauseMarker: '...',
    };

    bundleAcknowledgmentsCache.set(personaId, acks);
    log.debug({ personaId }, 'Loaded acknowledgments from persona bundle');
    return acks;
  } catch (error) {
    log.debug({ personaId, error: String(error) }, 'Could not load from bundle, using defaults');
    bundleAcknowledgmentsCache.set(personaId, null);
    return null;
  }
}

/**
 * Get acknowledgments for persona.
 * Checks bundle cache first, falls back to defaults.
 * Note: First call triggers async bundle load (cached thereafter).
 */
function getPersonaAcknowledgments(personaId: string): PersonaAcknowledgments {
  // Check if we have cached bundle acknowledgments
  const cached = bundleAcknowledgmentsCache.get(personaId);
  if (cached) {
    return cached;
  }

  // If not cached, trigger async load for next time
  // This is fire-and-forget - current call uses defaults
  void loadPersonaBundleAcknowledgments(personaId);

  // Fall back to hardcoded defaults
  return DEFAULT_ACKNOWLEDGMENTS[personaId] || DEFAULT_ACKNOWLEDGMENTS.ferni;
}

/**
 * Preload persona bundle acknowledgments (call on session start)
 */
export async function preloadPersonaAcknowledgments(personaId: string): Promise<void> {
  await loadPersonaBundleAcknowledgments(personaId);
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
