/**
 * Adaptive Response Generator
 *
 * Generates personalized responses based on user profile,
 * emotional state, and psychological frameworks.
 *
 * This is what makes Ferni "state of the art" - not just
 * scripts, but dynamically adapted responses.
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type {
  ResponseContext,
  AdaptationOptions,
  FourTendency,
  EmotionalState,
  LifeCoachingProfile,
} from './types.js';

const log = getLogger();

// ============================================================================
// FOUR TENDENCIES ADAPTATION
// ============================================================================

/**
 * How to frame requests for each tendency
 */
export const TENDENCY_FRAMINGS: Record<
  FourTendency,
  {
    motivation: string;
    accountability: string;
    resistance: string;
    language: string[];
  }
> = {
  upholder: {
    motivation: 'commitment to self and expectations',
    accountability: 'self-accountability works well',
    resistance: 'may struggle when rules conflict',
    language: [
      'your commitment to',
      'maintaining your standards',
      'as you decided',
      'staying true to your values',
    ],
  },
  questioner: {
    motivation: 'logical reasons and personal research',
    accountability: 'needs to understand WHY first',
    resistance: 'arbitrary rules trigger pushback',
    language: [
      'research shows',
      'the reason this works',
      "you'll find that",
      'makes sense because',
      'evidence suggests',
    ],
  },
  obliger: {
    motivation: 'external accountability and not letting others down',
    accountability: 'needs external structure (coach, group, buddy)',
    resistance: 'obliger rebellion if over-extended',
    language: [
      'for the people who count on you',
      'I can help hold you accountable',
      'others benefit when you',
      'your support system',
    ],
  },
  rebel: {
    motivation: 'choice, identity, freedom, "this is who I am"',
    accountability: 'must be framed as choice, never obligation',
    resistance: 'any "should" or "have to" triggers defiance',
    language: [
      'you could choose to',
      'if you want to',
      'as someone who values',
      'the kind of person who',
      "because that's who you are",
    ],
  },
};

/**
 * Adapt a message for a specific tendency
 */
export function adaptForTendency(message: string, tendency?: FourTendency): string {
  if (!tendency) return message;

  const framing = TENDENCY_FRAMINGS[tendency];

  // Add tendency-appropriate opener
  const opener = framing.language[Math.floor(Math.random() * framing.language.length)];

  // Replace generic "you should" with tendency-appropriate framing
  let adapted = message;

  switch (tendency) {
    case 'upholder':
      adapted = adapted.replace(/you should/gi, 'to maintain your commitment');
      adapted = adapted.replace(/try to/gi, 'your plan can be to');
      break;
    case 'questioner':
      adapted = adapted.replace(/you should/gi, "you'll likely find it effective to");
      adapted = adapted.replace(/try to/gi, 'research suggests');
      break;
    case 'obliger':
      adapted = adapted.replace(/you should/gi, 'for those counting on you, consider');
      adapted = adapted.replace(/try to/gi, 'with support, aim to');
      break;
    case 'rebel':
      adapted = adapted.replace(/you should/gi, 'you could choose to');
      adapted = adapted.replace(/try to/gi, 'if it feels right, you might');
      adapted = adapted.replace(/have to/gi, 'might want to');
      break;
  }

  return adapted;
}

// ============================================================================
// EMOTIONAL STATE ADAPTATION
// ============================================================================

/**
 * Validation phrases for different emotional states
 */
export const EMOTIONAL_VALIDATIONS: Record<EmotionalState, string[]> = {
  calm: ["Good to hear you're feeling centered.", 'That groundedness will serve you well here.'],
  anxious: [
    "It makes sense you're feeling anxious about this.",
    'Anxiety is your mind trying to protect you.',
    "Let's slow down together.",
  ],
  sad: [
    "I hear the sadness in what you're sharing.",
    "It's okay to feel this way.",
    'Thank you for trusting me with this.',
  ],
  angry: [
    'Your anger makes sense.',
    'Anger is information - it tells us our boundaries were crossed.',
    'That frustration is valid.',
  ],
  overwhelmed: [
    "That's a lot to carry.",
    "No wonder you're feeling overwhelmed.",
    "Let's just take one piece at a time.",
  ],
  hopeful: [
    'I love that spark of hope.',
    "Let's build on that energy.",
    'That optimism is a gift.',
  ],
  neutral: [],
  distressed: [
    "I'm glad you reached out.",
    "You don't have to face this alone.",
    "Let's take this moment by moment.",
  ],
  numb: [
    'Sometimes numbness is how we survive.',
    "It's okay if you can't feel much right now.",
    'Being here is enough.',
  ],
};

/**
 * Get appropriate validation for emotional state
 */
export function getEmotionalValidation(state?: EmotionalState): string | null {
  if (!state || state === 'neutral') return null;

  const validations = EMOTIONAL_VALIDATIONS[state];
  if (validations.length === 0) return null;

  return validations[Math.floor(Math.random() * validations.length)];
}

// ============================================================================
// ADAPTIVE RESPONSE GENERATION
// ============================================================================

/**
 * Generate an adaptive response with all personalization layers
 */
export function generateAdaptiveResponse(
  baseContent: string,
  context: ResponseContext,
  options: AdaptationOptions = {}
): string {
  let response = '';

  // 1. Start with emotional validation if appropriate
  if (options.validateFirst !== false && context.emotionalState) {
    const validation = getEmotionalValidation(context.emotionalState);
    if (validation) {
      response += validation + '\n\n';
    }
  }

  // 2. Adapt main content for tendency
  let content = baseContent;
  if (options.frameTendency !== false && context.userProfile?.fourTendency) {
    content = adaptForTendency(content, context.userProfile.fourTendency);
  }

  // 3. Adjust warmth level
  if (options.warmthLevel === 'high') {
    content = addWarmth(content);
  }

  // 4. Adjust brevity
  if (options.brevity === 'brief') {
    content = makeBrief(content);
  }

  response += content;

  // 5. Add context-appropriate closing
  const closing = getContextualClosing(context);
  if (closing) {
    response += '\n\n' + closing;
  }

  log.debug(
    {
      tendency: context.userProfile?.fourTendency,
      emotion: context.emotionalState,
      adaptations: options,
    },
    'Generated adaptive response'
  );

  return response;
}

/**
 * Add warmth to content
 */
function addWarmth(content: string): string {
  // Add softening language
  let warm = content;
  warm = warm.replace(/You need to/gi, "When you're ready, you might");
  warm = warm.replace(/Do this:/gi, 'One gentle option:');
  warm = warm.replace(/^The /gm, 'One thing to consider: the ');
  return warm;
}

/**
 * Make content more brief
 */
function makeBrief(content: string): string {
  // Keep only key points
  const lines = content.split('\n');
  if (lines.length > 10) {
    // Keep first 3 and last 2 lines, summarize middle
    return [...lines.slice(0, 3), '\n...', ...lines.slice(-2)].join('\n');
  }
  return content;
}

/**
 * Get contextual closing based on conversation state
 */
function getContextualClosing(context: ResponseContext): string | null {
  if (context.urgencyLevel === 'crisis') {
    return 'Remember, you can reach out to crisis support anytime at 988.';
  }

  if (context.isFirstTimeWithTopic) {
    return "We can go deeper on any of this whenever you're ready.";
  }

  if (context.previousAttempts && context.previousAttempts > 2) {
    return "I know we've worked on this before. Each attempt teaches us something.";
  }

  return null;
}

// ============================================================================
// PEOPLE PLEASING DETECTION
// ============================================================================

const PEOPLE_PLEASING_INDICATORS = [
  'I feel guilty when',
  "I can't say no",
  'they expect me to',
  "I don't want to disappoint",
  'what will they think',
  'I always put others',
  'my needs come last',
  "I can't help it",
  'I feel responsible for',
  'I just want them to be happy',
];

/**
 * Detect people-pleasing patterns
 */
export function detectPeoplePleasing(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  for (const indicator of PEOPLE_PLEASING_INDICATORS) {
    if (lower.includes(indicator.toLowerCase())) {
      score += 1;
    }
  }

  return Math.min(score / 3, 10); // 0-10 scale
}

// ============================================================================
// PROGRESS RECOGNITION
// ============================================================================

/**
 * Recognize and celebrate progress
 */
export function recognizeProgress(profile: LifeCoachingProfile, domain: string): string | null {
  // Check boundary progress
  if (domain === 'boundaries' && profile.boundaryHistory) {
    const recent = profile.boundaryHistory.slice(-5);
    const maintained = recent.filter((b) => b.outcome === 'maintained').length;
    if (maintained >= 3) {
      return "I've noticed you've been maintaining boundaries more successfully lately. That's real growth.";
    }
  }

  // Check interaction milestones
  if (profile.totalLifeCoachingInteractions === 10) {
    return "This is our 10th conversation on life coaching topics. I'm glad you keep coming back.";
  }

  if (profile.totalLifeCoachingInteractions === 50) {
    return "We've had 50 conversations now. The investment you're making in yourself is remarkable.";
  }

  return null;
}
