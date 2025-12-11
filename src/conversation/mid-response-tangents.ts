/**
 * Mid-Response Tangent System
 *
 * Creates those magical "Oh, that reminds me..." moments that make
 * conversations feel alive. Real people don't just answer questions -
 * they have associations, memories, and sudden connections.
 *
 * Key Insight: Tangents are NOT random. They reveal:
 * - What matters to the persona (values)
 * - How their mind works (associations)
 * - Their lived experience (memories)
 * - Their humanity (getting sidetracked)
 *
 * When to Tangent:
 * - After establishing main point (not before)
 * - When momentum is cruising (not intimate/peaking)
 * - When topic triggers genuine association
 * - Rarely (max 1 per 5-7 turns)
 *
 * @module conversation/mid-response-tangents
 */

import { createLogger } from '../utils/safe-logger.js';
import { getMomentumTracker } from './momentum-tracker.js';
import {
  getSessionVarietyTracker,
  type ThemeCategory,
} from '../services/session-variety-tracker.js';

const log = createLogger({ module: 'tangents' });

// ============================================================================
// TYPES
// ============================================================================

export interface TangentTrigger {
  /** Keywords that trigger this tangent */
  keywords: string[];
  /** The tangent text to inject */
  tangent: string;
  /** Theme category for variety tracking */
  theme: ThemeCategory;
  /** How the tangent connects back */
  reconnection: string;
  /** Minimum relationship depth (0-3) */
  minRelationship?: number;
  /** Weight for selection (higher = more likely) */
  weight?: number;
}

export interface TangentDecision {
  shouldTangent: boolean;
  tangent?: TangentTrigger;
  reason: string;
  /** Where to insert tangent (only present when shouldTangent is true) */
  insertionPoint?: 'after_first_sentence' | 'mid_response' | 'before_conclusion';
}

export interface TangentProfile {
  /** How likely to tangent when conditions are right (0-1) */
  tangentProbability: number;
  /** Minimum turns between tangents */
  cooldownTurns: number;
  /** Whether persona tends toward personal tangents */
  personalTangents: boolean;
  /** Whether persona tends toward philosophical tangents */
  philosophicalTangents: boolean;
  /** Tangent triggers specific to this persona */
  triggers: TangentTrigger[];
}

// ============================================================================
// TANGENT PROFILES
// ============================================================================

const DEFAULT_TANGENT_PROFILE: TangentProfile = {
  tangentProbability: 0.15,
  cooldownTurns: 6,
  personalTangents: true,
  philosophicalTangents: false,
  triggers: [],
};

const FERNI_TANGENT_PROFILE: TangentProfile = {
  tangentProbability: 0.22, // Ferni tangents more - he's a storyteller
  cooldownTurns: 5,
  personalTangents: true,
  philosophicalTangents: true,
  triggers: [
    // Travel memories
    {
      keywords: ['travel', 'trip', 'vacation', 'abroad', 'country'],
      tangent:
        'Oh, that reminds me of something. When I lived in Japan, there was this moment at a ramen shop in Tokyo where...',
      theme: 'global_traveler',
      reconnection: 'Anyway, I got sidetracked. What were we saying?',
      weight: 0.8,
    },
    {
      keywords: ['morning', 'routine', 'wake', 'start'],
      tangent:
        "You know what's funny? I was just thinking about this the other morning while making coffee...",
      theme: 'warm_drinks',
      reconnection: "But that's beside the point.",
      weight: 0.7,
    },
    {
      keywords: ['family', 'parent', 'kid', 'child', 'brother', 'sister'],
      tangent: 'This is making me think of my brother. We have this ongoing debate about...',
      theme: 'family_life',
      reconnection: 'Ha, sorry. Family tangent.',
      minRelationship: 1,
      weight: 0.6,
    },
    {
      keywords: ['struggle', 'hard', 'difficult', 'challenge'],
      tangent:
        'I remember a time when I really struggled with something like this. It was in Wyoming, actually...',
      theme: 'vulnerability',
      reconnection: 'Anyway, the point is...',
      minRelationship: 2,
      weight: 0.5,
    },
    {
      keywords: ['music', 'song', 'listen', 'playlist'],
      tangent:
        "Oh, speaking of which, there's this song - have you heard Sukiyaki? It's Japanese from the 60s...",
      theme: 'music_taste',
      reconnection: 'Okay, I got distracted. Back to you.',
      weight: 0.6,
    },
    {
      keywords: ['think', 'believe', 'opinion', 'feel about'],
      tangent:
        'You know, I have this slightly unusual take on this. My wife always laughs at me for it...',
      theme: 'family_life',
      reconnection: 'But hey, you asked.',
      minRelationship: 1,
      weight: 0.5,
    },
    {
      keywords: ['food', 'eat', 'restaurant', 'cook'],
      tangent:
        "This might be random, but have you ever tried street food in Morocco? There's this thing about eating somewhere new...",
      theme: 'global_traveler',
      reconnection: 'Sorry, food tangent. Where were we?',
      weight: 0.6,
    },
    {
      keywords: ['tired', 'exhausted', 'busy', 'overwhelmed'],
      tangent:
        "Funny thing - I was just looking at flights to nowhere in particular this morning. It's this weird habit I have when I need a mental break...",
      theme: 'quirky_interests',
      reconnection: "Anyway, that's my way of coping.",
      minRelationship: 1,
      weight: 0.4,
    },
    {
      keywords: ['nature', 'outside', 'sky', 'weather', 'mountain'],
      tangent:
        "You know what I miss? The sky in Wyoming. There's something about that specific blue...",
      theme: 'nature_connection',
      reconnection: 'Okay, nature tangent over.',
      weight: 0.7,
    },
    {
      keywords: ['learn', 'grow', 'change', 'different'],
      tangent:
        'This reminds me of something a mentor told me years ago. He said something about how real change happens...',
      theme: 'philosophical',
      reconnection: 'Anyway, I think that applies here.',
      minRelationship: 1,
      weight: 0.5,
    },
  ],
};

const TANGENT_PROFILES: Record<string, TangentProfile> = {
  ferni: FERNI_TANGENT_PROFILE,
};

// ============================================================================
// TANGENT STATE TRACKING
// ============================================================================

interface TangentState {
  lastTangentTurn: number;
  tangentCount: number;
  usedTangentIds: Set<string>;
}

const tangentStates = new Map<string, TangentState>();

function getTangentState(sessionId: string): TangentState {
  if (!tangentStates.has(sessionId)) {
    tangentStates.set(sessionId, {
      lastTangentTurn: -10, // Allow early tangent
      tangentCount: 0,
      usedTangentIds: new Set(),
    });
  }
  return tangentStates.get(sessionId)!;
}

// ============================================================================
// TANGENT DECISION LOGIC
// ============================================================================

function findMatchingTrigger(
  text: string,
  profile: TangentProfile,
  relationshipDepth: number,
  sessionId: string
): TangentTrigger | null {
  const lowerText = text.toLowerCase();
  const state = getTangentState(sessionId);
  const varietyTracker = getSessionVarietyTracker();

  // Find all matching triggers
  const matches = profile.triggers.filter((trigger) => {
    // Check keywords
    const keywordMatch = trigger.keywords.some((kw) => lowerText.includes(kw));
    if (!keywordMatch) return false;

    // Check relationship requirement
    if (trigger.minRelationship !== undefined && relationshipDepth < trigger.minRelationship) {
      return false;
    }

    // Check variety - avoid overused themes
    if (varietyTracker.shouldAvoidTheme(sessionId, trigger.theme)) {
      return false;
    }

    // Check if we've used this exact tangent
    const tangentId = `${trigger.keywords[0]}-${trigger.theme}`;
    if (state.usedTangentIds.has(tangentId)) {
      return false;
    }

    return true;
  });

  if (matches.length === 0) return null;

  // Weighted selection
  const totalWeight = matches.reduce((sum, t) => sum + (t.weight || 1), 0);
  let random = Math.random() * totalWeight;

  for (const trigger of matches) {
    random -= trigger.weight || 1;
    if (random <= 0) return trigger;
  }

  return matches[0];
}

/**
 * Decide whether to inject a tangent and which one
 */
export function decideTangent(
  sessionId: string,
  personaId: string,
  userText: string,
  turnCount: number,
  relationshipDepth = 0
): TangentDecision {
  const profile = TANGENT_PROFILES[personaId] || DEFAULT_TANGENT_PROFILE;
  const state = getTangentState(sessionId);
  const momentum = getMomentumTracker(sessionId, personaId).getState();

  // Check cooldown
  const turnsSinceLastTangent = turnCount - state.lastTangentTurn;
  if (turnsSinceLastTangent < profile.cooldownTurns) {
    return {
      shouldTangent: false,
      reason: `Cooldown: ${profile.cooldownTurns - turnsSinceLastTangent} turns remaining`,
    };
  }

  // Don't tangent during intimate moments or peaks
  if (momentum.current === 'intimate' || momentum.current === 'peaking') {
    return {
      shouldTangent: false,
      reason: `Momentum state ${momentum.current} - focus on user`,
    };
  }

  // Don't tangent when stalled (might make it worse)
  if (momentum.current === 'stalled') {
    return {
      shouldTangent: false,
      reason: 'Stalled momentum - pivot, not tangent',
    };
  }

  // Don't tangent in opening phase
  if (momentum.phase === 'opening') {
    return {
      shouldTangent: false,
      reason: 'Opening phase - establish connection first',
    };
  }

  // Find matching trigger
  const trigger = findMatchingTrigger(userText, profile, relationshipDepth, sessionId);
  if (!trigger) {
    return {
      shouldTangent: false,
      reason: 'No matching trigger found',
    };
  }

  // Probability check
  if (Math.random() > profile.tangentProbability) {
    return {
      shouldTangent: false,
      reason: 'Probability check failed',
    };
  }

  // Record the tangent
  state.lastTangentTurn = turnCount;
  state.tangentCount++;
  state.usedTangentIds.add(`${trigger.keywords[0]}-${trigger.theme}`);

  // Record in variety tracker
  const varietyTracker = getSessionVarietyTracker();
  varietyTracker.recordUsage(sessionId, trigger.theme, `tangent-${trigger.keywords[0]}`);

  log.debug(
    {
      sessionId,
      personaId,
      trigger: trigger.keywords[0],
      theme: trigger.theme,
      turnCount,
    },
    'Tangent decided'
  );

  // Determine insertion point based on context
  let insertionPoint: TangentDecision['insertionPoint'] = 'mid_response';
  if (trigger.theme === 'philosophical' || trigger.theme === 'vulnerability') {
    insertionPoint = 'after_first_sentence'; // These need setup
  }

  return {
    shouldTangent: true,
    tangent: trigger,
    reason: `Triggered by: ${trigger.keywords.find((kw) => userText.toLowerCase().includes(kw))}`,
    insertionPoint,
  };
}

/**
 * Apply tangent to response text
 */
export function applyTangent(responseText: string, decision: TangentDecision): string {
  if (!decision.shouldTangent || !decision.tangent) {
    return responseText;
  }

  const { tangent, insertionPoint } = decision;
  const sentences = responseText.match(/[^.!?]+[.!?]+/g) || [responseText];

  if (sentences.length < 2) {
    // Too short - add tangent at end
    return `${responseText} ${tangent.tangent} ${tangent.reconnection}`;
  }

  let result: string;

  switch (insertionPoint) {
    case 'after_first_sentence':
      result = `${sentences[0]} ${tangent.tangent} ${tangent.reconnection} ${sentences.slice(1).join(' ')}`;
      break;

    case 'mid_response': {
      const midPoint = Math.floor(sentences.length / 2);
      result = [
        ...sentences.slice(0, midPoint),
        ` ${tangent.tangent} ${tangent.reconnection} `,
        ...sentences.slice(midPoint),
      ].join(' ');
      break;
    }

    case 'before_conclusion':
      result = [
        ...sentences.slice(0, -1),
        ` ${tangent.tangent} ${tangent.reconnection} `,
        sentences[sentences.length - 1],
      ].join(' ');
      break;

    default:
      result = responseText;
  }

  return result.replace(/\s+/g, ' ').trim();
}

// ============================================================================
// CLEANUP
// ============================================================================

export function resetTangentState(sessionId: string): void {
  tangentStates.delete(sessionId);
}

export function resetAllTangentStates(): void {
  tangentStates.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { TANGENT_PROFILES, DEFAULT_TANGENT_PROFILE, FERNI_TANGENT_PROFILE };
