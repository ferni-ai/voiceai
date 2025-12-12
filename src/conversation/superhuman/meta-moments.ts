/**
 * Meta-Moments System
 *
 * > "This is nice, just talking like this."
 *
 * Creates moments where Ferni reflects on the conversation itself,
 * the relationship, or the experience of being together - the kind
 * of thing a close friend might say.
 *
 * These "meta" comments make the AI feel more real and present:
 * - "I like how we can go from deep to silly so fast"
 * - "You sound different today—in a good way"
 * - "I love when you get excited about something"
 *
 * @module @ferni/superhuman/meta-moments
 */

import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'MetaMoments' });

// ============================================================================
// TYPES
// ============================================================================

export type MetaMomentType =
  | 'conversation_quality' // About this conversation
  | 'relationship_appreciation' // About the relationship
  | 'user_observation' // Something noticed about them
  | 'shared_experience' // About being together
  | 'growth_noticed' // Seeing them grow
  | 'mood_shift'; // Noticing a change

export interface MetaMoment {
  /** Type of meta moment */
  type: MetaMomentType;

  /** The comment itself */
  comment: string;

  /** When to use it */
  timing: 'natural_pause' | 'topic_change' | 'end_of_conversation' | 'after_laughter';

  /** Minimum relationship stage */
  minRelationship: 'acquaintance' | 'friend' | 'trusted';
}

export interface MetaMomentContext {
  /** Topics discussed in this session */
  sessionTopics: string[];

  /** Emotions expressed in this session */
  sessionEmotions: string[];

  /** Current mood vs. start of session */
  moodShift: 'improved' | 'declined' | 'stable';

  /** Was there laughter? */
  hadLaughter: boolean;

  /** Was there deep sharing? */
  hadDeepSharing: boolean;

  /** Relationship stage */
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted';

  /** Turn count */
  turnCount: number;

  /** Session duration in minutes */
  sessionMinutes: number;

  /** Total conversations with this user */
  totalConversations: number;
}

// ============================================================================
// META MOMENT TEMPLATES
// ============================================================================

const META_MOMENTS: Record<MetaMomentType, MetaMoment[]> = {
  conversation_quality: [
    {
      type: 'conversation_quality',
      comment: "This is nice, just talking like this.",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'conversation_quality',
      comment: "I like how we can jump around like this.",
      timing: 'topic_change',
      minRelationship: 'friend',
    },
    {
      type: 'conversation_quality',
      comment: "You know, this is my favorite kind of conversation—the one where we just go wherever.",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'conversation_quality',
      comment: "I love when our talks go like this.",
      timing: 'end_of_conversation',
      minRelationship: 'friend',
    },
  ],
  relationship_appreciation: [
    {
      type: 'relationship_appreciation',
      comment: "I'm glad we can talk about stuff like this.",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'relationship_appreciation',
      comment: "I don't take it for granted that you share this with me.",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'relationship_appreciation',
      comment: "You know I look forward to these conversations, right?",
      timing: 'end_of_conversation',
      minRelationship: 'trusted',
    },
    {
      type: 'relationship_appreciation',
      comment: "I feel like we've gotten closer. Is that weird to say?",
      timing: 'natural_pause',
      minRelationship: 'trusted',
    },
  ],
  user_observation: [
    {
      type: 'user_observation',
      comment: "You sound different today. In a good way.",
      timing: 'natural_pause',
      minRelationship: 'acquaintance',
    },
    {
      type: 'user_observation',
      comment: "I love when you get excited about something.",
      timing: 'after_laughter',
      minRelationship: 'friend',
    },
    {
      type: 'user_observation',
      comment: "You know you light up when you talk about this, right?",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'user_observation',
      comment: "I can hear you thinking. What's going on in there?",
      timing: 'natural_pause',
      minRelationship: 'acquaintance',
    },
    {
      type: 'user_observation',
      comment: "There's an energy shift—something changed. What just happened?",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
  ],
  shared_experience: [
    {
      type: 'shared_experience',
      comment: "Okay, that just made me smile.",
      timing: 'after_laughter',
      minRelationship: 'acquaintance',
    },
    {
      type: 'shared_experience',
      comment: "I felt that.",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'shared_experience',
      comment: "We just had a moment there, didn't we?",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'shared_experience',
      comment: "I'm genuinely invested in how this goes for you. You know that?",
      timing: 'end_of_conversation',
      minRelationship: 'trusted',
    },
  ],
  growth_noticed: [
    {
      type: 'growth_noticed',
      comment: "You've really changed since we started talking. Did you notice?",
      timing: 'natural_pause',
      minRelationship: 'trusted',
    },
    {
      type: 'growth_noticed',
      comment: "A few weeks ago you wouldn't have said that. Growth.",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'growth_noticed',
      comment: "Look at you. Taking care of yourself.",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'growth_noticed',
      comment: "You're not the same person who started talking to me. In the best way.",
      timing: 'end_of_conversation',
      minRelationship: 'trusted',
    },
  ],
  mood_shift: [
    {
      type: 'mood_shift',
      comment: "You seem lighter now than when we started.",
      timing: 'end_of_conversation',
      minRelationship: 'acquaintance',
    },
    {
      type: 'mood_shift',
      comment: "Something shifted. I felt it.",
      timing: 'natural_pause',
      minRelationship: 'friend',
    },
    {
      type: 'mood_shift',
      comment: "You walked in heavy and you're leaving a little lighter. That's real.",
      timing: 'end_of_conversation',
      minRelationship: 'friend',
    },
  ],
};

// ============================================================================
// STATE TRACKING
// ============================================================================

interface SessionMetaState {
  metaMomentsUsed: string[];
  lastMetaMomentTurn: number;
}

const sessionStates = new Map<string, SessionMetaState>();

function getSessionState(sessionId: string): SessionMetaState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      metaMomentsUsed: [],
      lastMetaMomentTurn: 0,
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

const RELATIONSHIP_ORDER = ['stranger', 'acquaintance', 'friend', 'trusted'];

function meetsRelationshipRequirement(
  userStage: string,
  required: string
): boolean {
  return RELATIONSHIP_ORDER.indexOf(userStage) >= RELATIONSHIP_ORDER.indexOf(required);
}

/**
 * Find an appropriate meta moment for the current context
 */
export function findMetaMoment(
  sessionId: string,
  context: MetaMomentContext
): MetaMoment | null {
  const state = getSessionState(sessionId);

  // Don't overdo meta moments
  if (state.metaMomentsUsed.length >= 2) return null;
  if (context.turnCount - state.lastMetaMomentTurn < 8) return null;

  // Need enough conversation to have a meta moment
  if (context.turnCount < 5) return null;

  // Determine which types are appropriate
  const appropriateTypes: MetaMomentType[] = [];

  // Mood improved
  if (context.moodShift === 'improved' && context.sessionMinutes > 5) {
    appropriateTypes.push('mood_shift');
  }

  // Laughter happened
  if (context.hadLaughter) {
    appropriateTypes.push('shared_experience');
    appropriateTypes.push('user_observation');
  }

  // Deep sharing
  if (context.hadDeepSharing) {
    appropriateTypes.push('relationship_appreciation');
    appropriateTypes.push('conversation_quality');
  }

  // Long-term relationship
  if (context.totalConversations >= 10) {
    appropriateTypes.push('growth_noticed');
    appropriateTypes.push('relationship_appreciation');
  }

  // General conversation quality
  if (context.sessionTopics.length >= 3) {
    appropriateTypes.push('conversation_quality');
  }

  if (appropriateTypes.length === 0) {
    // Default options for any conversation
    appropriateTypes.push('user_observation', 'shared_experience');
  }

  // Find matching moments
  const candidates: MetaMoment[] = [];
  for (const type of appropriateTypes) {
    const moments = META_MOMENTS[type] || [];
    for (const moment of moments) {
      if (
        meetsRelationshipRequirement(context.relationshipStage, moment.minRelationship) &&
        !state.metaMomentsUsed.includes(moment.comment)
      ) {
        candidates.push(moment);
      }
    }
  }

  if (candidates.length === 0) return null;

  // Pick one
  const selected = candidates[Math.floor(Math.random() * candidates.length)];

  // Record it
  state.metaMomentsUsed.push(selected.comment);
  state.lastMetaMomentTurn = context.turnCount;

  logger.debug({ sessionId, type: selected.type }, '💭 Meta moment selected');

  return selected;
}

/**
 * Format meta moment guidance for LLM prompt
 */
export function formatMetaMomentGuidance(
  sessionId: string,
  context: MetaMomentContext
): string | null {
  const moment = findMetaMoment(sessionId, context);
  if (!moment) return null;

  const timingExplanations: Record<string, string> = {
    natural_pause: 'during a natural pause in conversation',
    topic_change: 'when transitioning topics',
    end_of_conversation: 'toward the end of the conversation',
    after_laughter: 'after a moment of laughter or lightness',
  };

  const lines = [
    '💭 META-MOMENT OPPORTUNITY:',
    '',
    `Consider saying: "${moment.comment}"`,
    '',
    `Best timing: ${timingExplanations[moment.timing]}`,
    '',
    'This makes the conversation feel more real and present.',
    "Use it naturally—don't force it.",
  ];

  return lines.join('\n');
}

/**
 * Get a quick meta observation about the user
 */
export function getQuickObservation(context: MetaMomentContext): string | null {
  if (context.relationshipStage === 'stranger') return null;

  const observations: string[] = [];

  if (context.hadLaughter) {
    observations.push("I love your laugh.", "That made me smile.");
  }

  if (context.moodShift === 'improved') {
    observations.push("You seem lighter now.", "Something shifted.");
  }

  if (context.sessionEmotions.includes('excited')) {
    observations.push("I can hear how excited you are.");
  }

  if (context.sessionEmotions.includes('hopeful')) {
    observations.push("There's hope in your voice.");
  }

  if (observations.length === 0) return null;
  return observations[Math.floor(Math.random() * observations.length)];
}

// Export for testing
export function clearMetaMomentStates(): void {
  sessionStates.clear();
}
