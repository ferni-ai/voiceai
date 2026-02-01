/**
 * Avoidance Pattern Detection Rules
 *
 * Pattern definitions for detecting 7 types of avoidance signals.
 *
 * @module @ferni/intelligence/deep-understanding/avoidance-detection/detection-rules
 */

import type { AvoidanceRule, AvoidanceSignalType } from './types.js';

// ============================================================================
// DETECTION RULES
// ============================================================================

export const AVOIDANCE_RULES: AvoidanceRule[] = [
  // 1. Topic Change
  {
    type: 'topic_change',
    patterns: [
      /anyway,? (let('s| us)|what about|how about)/i,
      /(but |so |anyway )?(speaking of|on another note|changing the subject)/i,
      /can we (talk about|discuss) something else/i,
      /I('d| would) rather (talk about|discuss)/i,
      /let('s| us) not (talk about|go there)/i,
      /I don('t| not) want to (talk about|discuss)/i,
    ],
    baseConfidence: 0.7,
    description: 'User abruptly changed the topic',
  },

  // 2. Vague Response
  {
    type: 'vague_response',
    patterns: [
      /I (don('t| not) know|guess|suppose)/i,
      /it('s| is) (complicated|hard to explain|difficult)/i,
      /I haven('t| have not) (really |)thought about (it|that)/i,
      /^(yeah|sure|maybe|I guess|kind of|sort of)\.?$/i,
      /^(fine|okay|alright|whatever)\.?$/i,
      /I('m| am) not (sure|certain)/i,
    ],
    baseConfidence: 0.5,
    description: 'User gave a vague, non-committal response',
  },

  // 3. Deflection
  {
    type: 'deflection',
    patterns: [
      /what about (you|your)/i,
      /how (about|do) you (feel|think)/i,
      /you should (ask|talk to)/i,
      /that('s| is) (their|his|her|someone else('s|)) problem/i,
      /it('s| is) (not up to me|out of my hands)/i,
      /ask (them|him|her|someone else)/i,
    ],
    baseConfidence: 0.65,
    description: 'User deflected to someone or something else',
  },

  // 4. Minimization
  {
    type: 'minimization',
    patterns: [
      /it('s| is) not (a )?(big deal|big thing|that bad|that serious)/i,
      /not (a )?(big deal|big thing)/i,
      /it('s| is) (fine|okay|nothing|whatever)/i,
      /I('m| am) (fine|okay|alright|good)/i,
      /it doesn('t| does not) (matter|bother me)/i,
      /I('ve| have) had worse/i,
      /there are (worse|bigger) (things|problems)/i,
      /it('s| is) (not|no) (worth|that important)/i,
    ],
    baseConfidence: 0.6,
    description: 'User minimized the significance of something',
  },

  // 5. Humor Shield
  {
    type: 'humor_shield',
    patterns: [
      /haha|lol|😂|😅|🤣/i,
      /I('m| am) (just |)joking|kidding/i,
      /but (seriously|for real|anyway)/i,
      /just a joke/i,
      // Nervous laughter markers
      /\*laughs\*|\*nervous laugh\*/i,
    ],
    baseConfidence: 0.5,
    description: 'User used humor to deflect from serious topic',
  },

  // 6. Generalization
  {
    type: 'generalization',
    patterns: [
      /(everyone|everybody|people|we all) (goes through|has|does|feels)/i,
      /it('s| is) (normal|common|typical)/i,
      /that('s| is) (just |)(how|the way) (it is|things are|life is)/i,
      /these things happen/i,
      /it('s| is) (part of|just) life/i,
      /who doesn('t| does not)/i,
    ],
    baseConfidence: 0.55,
    description: 'User generalized to avoid personal specifics',
  },

  // 7. Time Pressure
  {
    type: 'time_pressure',
    patterns: [
      /I (don('t| not) have|have no) time/i,
      /can we (do this|talk about this) later/i,
      /I('m| am) (busy|in a hurry|running late)/i,
      /let('s| us) (move on|keep going|get back to)/i,
      /we('re| are) running out of time/i,
      /I (need|have) to go/i,
    ],
    baseConfidence: 0.6,
    description: 'User cited time pressure to avoid topic',
  },
];

// ============================================================================
// SUGGESTED WORDINGS
// ============================================================================

/**
 * Gentle inquiry wordings for acknowledged patterns
 */
export const GENTLE_INQUIRY_WORDINGS: Record<AvoidanceSignalType, string[]> = {
  topic_change: [
    "I notice we've shifted away from that topic a few times...",
    "We keep moving away from that. Is it something you'd rather not discuss?",
  ],
  vague_response: [
    "I sense there might be more there than you're saying...",
    'It seems like this is hard to put into words...',
  ],
  deflection: [
    'We keep turning this around. What about how you feel about it?',
    "I'm more curious about your experience with this...",
  ],
  minimization: [
    "You say it's not a big deal, but I wonder if it affects you more than that...",
    'I notice you tend to brush this off. Is it something we should explore?',
  ],
  humor_shield: [
    "There's humor there, but I sense something deeper underneath...",
    "I appreciate the lightness, but I'm curious about the real feeling...",
  ],
  generalization: [
    "You mentioned everyone goes through this, but what's it like for you specifically?",
    "Let's put the 'everyone' aside. What's your experience with this?",
  ],
  time_pressure: [
    "We've hit time constraints around this topic before. Is it one we should make more space for?",
    'I notice time seems to run out when this comes up...',
  ],
};

// ============================================================================
// THRESHOLDS
// ============================================================================

export const THRESHOLDS = {
  /** Minimum signals to form a pattern */
  minSignalsForPattern: 3,

  /** Sessions needed to consider cross-session pattern */
  minSessionsForPattern: 2,

  /** Strength threshold for "strong" pattern */
  strongPatternThreshold: 0.6,

  /** Confidence threshold for detection */
  minConfidence: 0.5,

  /** Decay factor for old patterns (per day) */
  patternDecayPerDay: 0.05,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get rule by type
 */
export function getRuleByType(type: AvoidanceSignalType): AvoidanceRule | undefined {
  return AVOIDANCE_RULES.find((r) => r.type === type);
}

/**
 * Get random gentle inquiry wording
 */
export function getGentleInquiry(type: AvoidanceSignalType): string {
  const wordings = GENTLE_INQUIRY_WORDINGS[type];
  return wordings[Math.floor(Math.random() * wordings.length)];
}
