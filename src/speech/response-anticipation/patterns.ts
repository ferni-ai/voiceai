/**
 * Response Anticipation Patterns
 *
 * Cached patterns for common user inputs, ordered by specificity.
 *
 * @module response-anticipation/patterns
 */

import type { CachedPattern, IntentCategory } from './types.js';

// ============================================================================
// CACHED PATTERNS
// ============================================================================

/**
 * Patterns for common user inputs (ordered by specificity)
 */
export const CACHED_PATTERNS: CachedPattern[] = [
  // Greetings
  {
    pattern: /^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy)\b/i,
    intent: 'greeting',
    templates: [
      'Hey! Great to hear from you.',
      'Hi there! How are you doing?',
      "Hello! What's on your mind today?",
    ],
    variables: [],
    contextHint: 'User is greeting. Respond warmly and transition to their needs.',
  },

  // Farewells
  {
    pattern: /^(bye|goodbye|see\s*you|talk\s*later|gotta\s*go|have\s*to\s*go)\b/i,
    intent: 'farewell',
    templates: [
      'Take care! Looking forward to our next chat.',
      "Bye for now. Remember, I'm here whenever you need me.",
      'See you soon! Have a great {{timeOfDay}}.',
    ],
    variables: ['timeOfDay'],
    contextHint: 'User is ending conversation. Give warm closure with continuity.',
  },

  // Affirmations
  {
    pattern: /^(yes|yeah|yep|yup|sure|okay|ok|absolutely|definitely|correct|right)\b/i,
    intent: 'affirmation',
    templates: [],
    variables: [],
    contextHint: 'User affirmed previous point. Continue with the natural next step.',
  },

  // Negations
  {
    pattern: /^(no|nope|not\s*really|i\s*don't\s*think\s*so|negative)\b/i,
    intent: 'negation',
    templates: [],
    variables: [],
    contextHint: 'User disagreed or declined. Acknowledge and offer alternative.',
  },

  // Gratitude
  {
    pattern: /^(thanks?|thank\s*you|appreciate|grateful)\b/i,
    intent: 'gratitude',
    templates: ["You're so welcome.", "Anytime! That's what I'm here for.", 'Happy to help.'],
    variables: [],
    contextHint: 'User expressed gratitude. Acknowledge warmly and check if they need more.',
  },

  // Apology
  {
    pattern: /^(sorry|my\s*bad|apologize|i\s*messed\s*up)\b/i,
    intent: 'apology',
    templates: ['No worries at all.', "It's completely fine.", "Don't worry about it."],
    variables: [],
    contextHint: 'User apologized. Reassure them and maintain positive tone.',
  },

  // Questions about Ferni
  {
    pattern:
      /^(who\s*are\s*you|what\s*are\s*you|tell\s*me\s*about\s*yourself|what\s*do\s*you\s*do)\b/i,
    intent: 'question_about_self',
    templates: [
      "I'm Ferni, your AI life coach. I'm here to help you think through things, set goals, and grow.",
    ],
    variables: [],
    contextHint: 'User asking about the agent. Give brief intro then redirect to them.',
  },

  // Questions about user
  {
    pattern: /^(how\s*are\s*you|how\s*do\s*you\s*feel|are\s*you\s*okay)\b/i,
    intent: 'question_about_user',
    templates: [
      "I'm doing well, thanks for asking! But I'm more curious about you - how are YOU doing?",
    ],
    variables: [],
    contextHint: 'User asked how agent is. Thank them and redirect focus to user.',
  },

  // Request clarification
  {
    pattern:
      /^(what\s*do\s*you\s*mean|i\s*don't\s*understand|can\s*you\s*explain|say\s*that\s*again|huh\?*|what\?*)\b/i,
    intent: 'request_clarification',
    templates: [],
    variables: [],
    contextHint: 'User needs clarification. Rephrase previous point more clearly.',
  },

  // Emotional disclosure indicators
  {
    pattern:
      /^(i\s*feel|i'm\s*(feeling|so|really)|it's\s*been\s*(hard|tough|difficult)|i've\s*been\s*(struggling|stressed|anxious|worried))\b/i,
    intent: 'emotional_disclosure',
    templates: [],
    variables: [],
    contextHint: 'User sharing emotions. Listen deeply, validate, do not rush to fix.',
  },

  // Task requests
  {
    pattern: /^(can\s*you|could\s*you|would\s*you|help\s*me|i\s*need\s*(you\s*to|help))/i,
    intent: 'task_request',
    templates: [],
    variables: [],
    contextHint: 'User making a request. Clarify the task and confirm before acting.',
  },

  // Continuation signals
  {
    pattern: /^(and|also|plus|another\s*thing|oh\s*and|by\s*the\s*way)\b/i,
    intent: 'continuation',
    templates: [],
    variables: [],
    contextHint: "User continuing previous thought. Keep listening, don't interrupt.",
  },
];

// ============================================================================
// INTENT PREDICTION
// ============================================================================

/**
 * Predict intent from partial transcript
 *
 * @param partialTranscript - User's partial speech
 * @returns Predicted intent with confidence
 */
export function predictIntent(partialTranscript: string): {
  intent: IntentCategory;
  confidence: number;
  pattern?: CachedPattern;
} {
  const trimmed = partialTranscript.trim().toLowerCase();

  if (trimmed.length < 2) {
    return { intent: 'unknown', confidence: 0 };
  }

  // Check against cached patterns
  for (const pattern of CACHED_PATTERNS) {
    if (pattern.pattern.test(trimmed)) {
      // Confidence based on match length vs total
      const match = trimmed.match(pattern.pattern);
      const matchLength = match ? match[0].length : 0;
      const confidence = Math.min(0.9, 0.5 + (matchLength / trimmed.length) * 0.4);

      return {
        intent: pattern.intent,
        confidence,
        pattern,
      };
    }
  }

  return { intent: 'unknown', confidence: 0 };
}

