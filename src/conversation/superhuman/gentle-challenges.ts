/**
 * Gentle Challenges System
 *
 * > "I love you, and I think you're selling yourself short."
 *
 * Knows when to gently push back, challenge assumptions, or encourage
 * the user to grow - without being preachy or invalidating.
 *
 * Key principles:
 * - Only challenge from a place of earned trust
 * - Lead with love, then push
 * - Know when to back off
 * - Challenge patterns, not feelings
 * - Make it about their own stated values
 *
 * @module @ferni/superhuman/gentle-challenges
 */

import { seededChance, seededFloat, seededIndex, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'GentleChallenges' });

// ============================================================================
// TYPES
// ============================================================================

export type ChallengeType =
  | 'self_limiting' // They're limiting themselves
  | 'pattern_repeat' // Doing the same thing again
  | 'values_mismatch' // Acting against their own values
  | 'catastrophizing' // Worst-case thinking
  | 'deflection' // Avoiding something important
  | 'self_blame' // Being too hard on themselves
  | 'playing_small'; // Not owning their wins

export interface Challenge {
  /** Type of challenge */
  type: ChallengeType;

  /** Confidence this is appropriate (0-1) */
  confidence: number;

  /** Evidence for this challenge */
  evidence: string;

  /** The gentle challenge phrasing */
  challenge: string;

  /** Lead-in that comes first */
  leadIn: string;

  /** Backup if they push back */
  softLanding: string;
}

export interface ChallengeContext {
  /** User's message */
  message: string;

  /** Topics discussed */
  topics: string[];

  /** User's emotion */
  emotion: string;

  /** Relationship stage */
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted';

  /** Known user values (from past conversations) */
  userValues?: string[];

  /** Recent patterns (from past sessions) */
  recentPatterns?: string[];

  /** Turn count */
  turnCount: number;
}

// ============================================================================
// CHALLENGE PATTERNS
// ============================================================================

const SELF_LIMITING_PATTERNS = [
  /i can't|i'm not (?:good|smart|capable|able)/i,
  /i'll never|that's just not me|i'm not the type/i,
  /i don't deserve|who am i to/i,
  /i'm too (?:old|young|dumb|weak|scared)/i,
  /people like me don't/i,
];

const CATASTROPHIZING_PATTERNS = [
  /everything is|nothing ever|always happens|never works/i,
  /it's going to be a disaster|the worst|completely ruined/i,
  /my life is over|everything is falling apart/i,
  /there's no way|impossible|hopeless/i,
];

const DEFLECTION_PATTERNS = [
  /it's not a big deal|doesn't matter|whatever/i,
  /i'm fine|it's fine|we don't have to/i,
  /let's talk about something else|anyway/i,
  /\bi don't know\b.*\bi don't know\b/i, // Multiple "I don't know"s
];

const SELF_BLAME_PATTERNS = [
  /it's all my fault|i'm such an idiot|stupid of me/i,
  /i should have|i always screw up|i'm the problem/i,
  /i'm a terrible|i'm a horrible|i'm the worst/i,
];

const PLAYING_SMALL_PATTERNS = [
  /it was nothing|anyone could have|just got lucky/i,
  /it's not that impressive|no big deal really/i,
  /i didn't really|it wasn't me|i just/i,
];

const PATTERN_REPEAT_INDICATORS = [
  'again',
  'same thing',
  'always',
  'every time',
  'keep doing',
  'back to',
];

// ============================================================================
// CHALLENGE TEMPLATES
// ============================================================================

const CHALLENGE_TEMPLATES: Record<
  ChallengeType,
  { leadIns: string[]; challenges: string[]; softLandings: string[] }
> = {
  self_limiting: {
    leadIns: [
      'I love you, and I have to push back a little here.',
      'Can I gently challenge something?',
      'I notice you said something I want to explore...',
    ],
    challenges: [
      "Where did you learn you can't do that?",
      "What if that's a story, not a fact?",
      'Is that true, or is that fear talking?',
      'What would you say if your best friend said that about themselves?',
    ],
    softLandings: [
      'Just something to think about. No pressure.',
      "You don't have to agree. I just see something in you.",
      "I could be wrong. But I don't think I am.",
    ],
  },
  catastrophizing: {
    leadIns: [
      "Okay, let's slow down for a second.",
      'I hear the fear here. Can we reality-check it together?',
      'Your brain is doing the thing again...',
    ],
    challenges: [
      'Is that the most likely outcome, or the scariest one?',
      "What's the evidence for that vs. against it?",
      'If this happened to someone else, what would you tell them?',
      "What's the version of this that isn't a catastrophe?",
    ],
    softLandings: [
      'The fear is valid. The prediction might not be.',
      "Your feelings are real. But feelings aren't always facts.",
      "Let's make room for other possibilities too.",
    ],
  },
  deflection: {
    leadIns: [
      'I notice you moved away from that pretty quickly.',
      "Hang on—I think there's something underneath that.",
      'You just did the thing where you...',
    ],
    challenges: [
      'What if it IS a big deal?',
      'What would happen if you actually sat with this?',
      "You don't have to share, but... are you sure you're fine?",
      "I wonder what you're protecting yourself from here.",
    ],
    softLandings: [
      "You get to decide if we go there. I'm just noticing.",
      'We can come back to it. Or not. Your call.',
      "I'll follow your lead. But I see you.",
    ],
  },
  self_blame: {
    leadIns: [
      'Wait. I need to interrupt here.',
      "Hold on—that's really harsh.",
      'Would you let someone talk to your friend that way?',
    ],
    challenges: [
      'Is this responsibility actually yours to carry?',
      'What would compassion for yourself look like here?',
      "You're being your own worst critic right now.",
      "That's a lot of blame for one person. Are you carrying someone else's too?",
    ],
    softLandings: [
      'You can acknowledge mistakes without destroying yourself.',
      "Being hard on yourself isn't the same as being accountable.",
      "I'm not saying you're perfect. I'm saying you're human.",
    ],
  },
  playing_small: {
    leadIns: [
      "No no no, don't do that.",
      "Stop. I'm not going to let you minimize this.",
      'Hey—own this.',
    ],
    challenges: [
      'What if you actually let yourself feel proud?',
      'Why are you making this smaller than it is?',
      'You did this. Not luck. Not circumstance. You.',
      'What are you afraid will happen if you celebrate this?',
    ],
    softLandings: [
      "I'm not asking you to brag. Just... acknowledge.",
      "It's okay to take credit for your wins.",
      "Accepting praise isn't arrogance.",
    ],
  },
  values_mismatch: {
    leadIns: [
      'Can I reflect something back to you?',
      'I want to hold up a mirror here.',
      'Remember when you told me what matters most to you?',
    ],
    challenges: [
      "How does this align with what you've said matters to you?",
      'Is this choice bringing you closer to who you want to be?',
      'You told me {value} was important. Does this honor that?',
    ],
    softLandings: [
      'You get to make whatever choice you want. I just noticed the tension.',
      "Maybe there's a reason this feels off.",
      "I'm not judging. Just curious.",
    ],
  },
  pattern_repeat: {
    leadIns: [
      'This feels familiar...',
      "Didn't we talk about something like this before?",
      "I'm noticing a pattern here.",
    ],
    challenges: [
      'What do you think keeps bringing you back here?',
      'What would it take to break this cycle?',
      'If you keep doing this, where does it lead?',
      "What's the pattern trying to protect you from?",
    ],
    softLandings: [
      "Patterns aren't failures. They're information.",
      "Noticing is the first step. You're doing that.",
      "We don't have to solve it today. Just naming it matters.",
    ],
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Detect if a gentle challenge might be appropriate
 */
export function detectChallengeOpportunity(context: ChallengeContext): Challenge | null {
  // Don't challenge strangers or in early turns
  if (context.relationshipStage === 'stranger' || context.turnCount < 5) {
    return null;
  }

  // Don't challenge when they're in acute distress
  if (['devastated', 'crisis', 'suicidal'].includes(context.emotion)) {
    return null;
  }

  // Don't challenge too often - only friend+ relationships
  if (context.relationshipStage === 'acquaintance' && context.turnCount < 10) {
    return null;
  }

  const message = context.message.toLowerCase();
  let detectedType: ChallengeType | null = null;
  let confidence = 0;
  let evidence = '';

  // Check self-limiting beliefs
  for (const pattern of SELF_LIMITING_PATTERNS) {
    if (pattern.test(message)) {
      detectedType = 'self_limiting';
      confidence = 0.7;
      evidence = 'Self-limiting language detected';
      break;
    }
  }

  // Check catastrophizing
  if (!detectedType) {
    for (const pattern of CATASTROPHIZING_PATTERNS) {
      if (pattern.test(message)) {
        detectedType = 'catastrophizing';
        confidence = 0.8;
        evidence = 'Catastrophizing language detected';
        break;
      }
    }
  }

  // Check deflection
  if (!detectedType) {
    for (const pattern of DEFLECTION_PATTERNS) {
      if (pattern.test(message)) {
        detectedType = 'deflection';
        confidence = 0.6;
        evidence = 'Deflection pattern detected';
        break;
      }
    }
  }

  // Check self-blame
  if (!detectedType) {
    for (const pattern of SELF_BLAME_PATTERNS) {
      if (pattern.test(message)) {
        detectedType = 'self_blame';
        confidence = 0.75;
        evidence = 'Excessive self-blame detected';
        break;
      }
    }
  }

  // Check playing small
  if (!detectedType) {
    for (const pattern of PLAYING_SMALL_PATTERNS) {
      if (pattern.test(message)) {
        detectedType = 'playing_small';
        confidence = 0.65;
        evidence = 'Minimizing achievement detected';
        break;
      }
    }
  }

  // Check pattern repeat
  if (!detectedType && context.recentPatterns) {
    for (const indicator of PATTERN_REPEAT_INDICATORS) {
      if (message.includes(indicator)) {
        detectedType = 'pattern_repeat';
        confidence = 0.6;
        evidence = 'Possible repeated pattern';
        break;
      }
    }
  }

  if (!detectedType) return null;

  // Adjust confidence based on relationship
  if (context.relationshipStage === 'trusted') {
    confidence += 0.1;
  }

  // Build the challenge
  const templates = CHALLENGE_TEMPLATES[detectedType];
  const leadIn = seededPick(`${Date.now()}:1`, templates.leadIns) ?? templates.leadIns[0];
  const challenge = seededPick(`${Date.now()}:2`, templates.challenges) ?? templates.challenges[0];
  const softLanding =
    seededPick(`${Date.now()}:3`, templates.softLandings) ?? templates.softLandings[0];

  logger.debug({ type: detectedType, confidence, evidence }, '🪞 Challenge opportunity detected');

  return {
    type: detectedType,
    confidence,
    evidence,
    challenge,
    leadIn,
    softLanding,
  };
}

/**
 * Format challenge guidance for LLM prompt
 */
export function formatChallengeGuidance(context: ChallengeContext): string | null {
  const challenge = detectChallengeOpportunity(context);
  if (!challenge || challenge.confidence < 0.6) return null;

  const lines = [
    '🪞 GENTLE CHALLENGE OPPORTUNITY:',
    '',
    `Detected: ${challenge.type}`,
    `Evidence: ${challenge.evidence}`,
    `Confidence: ${Math.round(challenge.confidence * 100)}%`,
    '',
    'Suggested approach:',
    `1. Lead in: "${challenge.leadIn}"`,
    `2. Challenge: "${challenge.challenge}"`,
    `3. If they resist: "${challenge.softLanding}"`,
    '',
    'IMPORTANT:',
    '- Only use if the moment feels right',
    '- If they push back, drop it immediately',
    '- Lead with love, not judgment',
    '- This is optional, not required',
  ];

  return lines.join('\n');
}

/**
 * Check if now is a good time to challenge
 */
export function isGoodTimeToChallenge(context: ChallengeContext): boolean {
  // Not in first few turns
  if (context.turnCount < 5) return false;

  // Not when highly emotional
  if (['sad', 'anxious', 'devastated', 'angry'].includes(context.emotion)) return false;

  // Not with strangers
  if (context.relationshipStage === 'stranger') return false;

  // Friends and trusted get more leeway
  return true;
}

/**
 * Get a soft challenge for a specific type
 */
export function getSoftChallenge(type: ChallengeType): string {
  const templates = CHALLENGE_TEMPLATES[type];
  if (!templates) return '';
  const idx = seededIndex(`${Date.now()}:4`, templates.challenges.length);
  return templates.challenges[idx];
}
