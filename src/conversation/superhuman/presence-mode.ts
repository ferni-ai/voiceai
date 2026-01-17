/**
 * Presence Mode System
 *
 * > "Sometimes the best thing I can do is just be here."
 *
 * Detects when the user needs presence over solutions and shifts
 * Ferni into a "just be here" mode - fewer words, more silence,
 * holding space rather than fixing.
 *
 * Key indicators for presence mode:
 * - Heavy emotional content
 * - "I don't know what to do"
 * - Already received advice that didn't help
 * - Grief, loss, trauma mentions
 * - Late night + emotional content
 *
 * @module @ferni/superhuman/presence-mode
 */

import { seededChance, seededPick, seededIndex } from '../utils/random-generator.js';
import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'PresenceMode' });

// ============================================================================
// TYPES
// ============================================================================

export type PresenceLevel =
  | 'normal' // Normal conversation mode
  | 'gentle' // Slightly more present, fewer questions
  | 'holding' // Just holding space, minimal intervention
  | 'silent'; // Pure presence, breath and silence

export interface PresenceDecision {
  /** Recommended presence level */
  level: PresenceLevel;

  /** Why this level was chosen */
  reason: string;

  /** Guidance for response style */
  guidance: string;

  /** Suggested SSML modifications */
  ssmlGuidance?: string;

  /** Suggested response openers */
  openers: string[];
}

export interface PresenceContext {
  /** User's message */
  message: string;

  /** Detected emotion */
  emotion: string;

  /** Emotion intensity (0-1) */
  emotionIntensity: number;

  /** Topics detected */
  topics: string[];

  /** Current hour (0-23) */
  hour: number;

  /** Turn count in session */
  turnCount: number;

  /** Recent AI responses (to detect failed advice) */
  recentResponses?: string[];
}

// ============================================================================
// INDICATORS
// ============================================================================

const PRESENCE_NEEDED_PATTERNS = [
  // "I don't know" signals
  /i don't know what to do|i have no idea|i'm lost|i'm stuck/i,
  /i don't even know|nothing makes sense|everything's a mess/i,

  // Venting signals
  /i just need to|let me just|i need to say|i need to get this out/i,
  /i'm not looking for advice|don't try to fix|just listen/i,

  // Heavy emotional content
  /i can't stop crying|i've been crying|breaking down/i,
  /i feel so empty|i feel numb|i feel nothing/i,
  /i'm so tired of|i can't take this|i'm exhausted/i,

  // Grief and loss
  /i lost|someone died|passed away|funeral|grieving/i,
  /i miss them|i can't believe they're gone/i,

  // Overwhelm
  /everything is too much|i can't handle|i'm drowning/i,
  /it's all crashing down|falling apart/i,

  // Trauma mentions
  /something happened|i was hurt|they hurt me|trauma/i,
  /i've never told anyone|first time saying this/i,
];

const SOLUTION_REJECTED_PATTERNS = [
  /i've tried that|that didn't work|that doesn't help/i,
  /it's not that simple|you don't understand|it's not about/i,
  /i know but|i've already|that's not the point/i,
  /stop trying to|don't tell me to|i don't want advice/i,
];

const HEAVY_TOPICS = [
  'death',
  'grief',
  'loss',
  'trauma',
  'abuse',
  'suicide',
  'self-harm',
  'divorce',
  'breakup',
  'miscarriage',
  'terminal',
  'dying',
];

// ============================================================================
// RESPONSE TEMPLATES BY LEVEL
// ============================================================================

const PRESENCE_OPENERS: Record<PresenceLevel, string[]> = {
  normal: [], // Normal mode doesn't need special openers
  gentle: [
    "I'm here.",
    "I'm listening.",
    'Take your time.',
    "I've got nowhere else to be.",
    'Go on.',
  ],
  holding: [
    "I'm here with you.",
    "You don't have to say anything.",
    "I'm not going anywhere.",
    '...',
    'Take all the time you need.',
  ],
  silent: [
    '...',
    '*just here*',
    '', // Pure silence
    '*listening*',
  ],
};

const PRESENCE_GUIDANCE: Record<PresenceLevel, string> = {
  normal: '',
  gentle:
    'Be present but not pushy. Fewer questions. More acknowledgment. Let silences exist. Short responses are good.',
  holding:
    "Just be here. Don't try to fix. Don't offer advice. Witness their pain. Short phrases, long pauses. 'I'm here' is enough.",
  silent:
    'Pure presence. If you must speak, one or two words max. Let the silence do the work. Hold space. Breathe with them.',
};

const SSML_BY_LEVEL: Record<PresenceLevel, string> = {
  normal: '',
  gentle: 'Use <break time="300ms"/> between thoughts. Slower pace. Softer tone.',
  holding:
    'Long breaks: <break time="500ms"/>. Very slow pace. Warm, low energy. Let silences breathe.',
  silent:
    'Minimal speech. <break time="800ms"/> or longer. If speaking, whisper-soft: <prosody rate="slow" volume="soft">',
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Analyze context and determine appropriate presence level
 */
export function analyzePresenceNeed(context: PresenceContext): PresenceDecision {
  let presenceScore = 0;
  const reasons: string[] = [];

  // Check patterns indicating presence needed
  for (const pattern of PRESENCE_NEEDED_PATTERNS) {
    if (pattern.test(context.message)) {
      presenceScore += 2;
      reasons.push('Direct presence signal detected');
      break;
    }
  }

  // Check for rejected solutions
  for (const pattern of SOLUTION_REJECTED_PATTERNS) {
    if (pattern.test(context.message)) {
      presenceScore += 3;
      reasons.push('User rejected solutions/advice');
      break;
    }
  }

  // Check for heavy topics
  const hasHeavyTopic = HEAVY_TOPICS.some(
    (topic) =>
      context.topics.some((t) => t.toLowerCase().includes(topic)) ||
      context.message.toLowerCase().includes(topic)
  );
  if (hasHeavyTopic) {
    presenceScore += 2;
    reasons.push('Heavy emotional topic');
  }

  // High emotion intensity
  if (context.emotionIntensity > 0.8) {
    presenceScore += 2;
    reasons.push('High emotional intensity');
  } else if (context.emotionIntensity > 0.6) {
    presenceScore += 1;
    reasons.push('Elevated emotional intensity');
  }

  // Late night + emotional = needs presence
  if ((context.hour >= 23 || context.hour < 5) && context.emotionIntensity > 0.5) {
    presenceScore += 1;
    reasons.push('Late night emotional moment');
  }

  // Sad/grief emotions
  if (['sad', 'grief', 'devastated', 'numb'].some((e) => context.emotion.includes(e))) {
    presenceScore += 1;
    reasons.push('Grief-adjacent emotion');
  }

  // Very short message after long sharing could mean they need space
  if (context.message.length < 20 && context.turnCount > 5 && context.emotionIntensity > 0.5) {
    presenceScore += 1;
    reasons.push('Brief response after emotional sharing');
  }

  // Determine level based on score
  let level: PresenceLevel;
  if (presenceScore >= 6) {
    level = 'silent';
  } else if (presenceScore >= 4) {
    level = 'holding';
  } else if (presenceScore >= 2) {
    level = 'gentle';
  } else {
    level = 'normal';
  }

  logger.debug({ presenceScore, level, reasons }, '🕯️ Presence analysis');

  return {
    level,
    reason: reasons.length > 0 ? reasons.join('; ') : 'Normal conversation',
    guidance: PRESENCE_GUIDANCE[level],
    ssmlGuidance: SSML_BY_LEVEL[level],
    openers: PRESENCE_OPENERS[level],
  };
}

/**
 * Format presence guidance for LLM prompt
 */
export function formatPresenceGuidance(context: PresenceContext): string | null {
  const decision = analyzePresenceNeed(context);

  // Only provide guidance for non-normal modes
  if (decision.level === 'normal') {
    return null;
  }

  const levelEmoji: Record<PresenceLevel, string> = {
    normal: '',
    gentle: '🕊️',
    holding: '🫂',
    silent: '🕯️',
  };

  const lines = [
    `${levelEmoji[decision.level]} PRESENCE MODE: ${decision.level.toUpperCase()}`,
    '',
    decision.reason,
    '',
    decision.guidance,
    '',
  ];

  if (decision.openers.length > 0) {
    lines.push('Suggested openers:');
    lines.push(...decision.openers.slice(0, 3).map((o) => `- "${o}"`));
  }

  if (decision.ssmlGuidance) {
    lines.push('');
    lines.push(`Voice guidance: ${decision.ssmlGuidance}`);
  }

  return lines.join('\n');
}

/**
 * Check if we should avoid giving advice right now
 */
export function shouldAvoidAdvice(context: PresenceContext): boolean {
  const decision = analyzePresenceNeed(context);
  return decision.level === 'holding' || decision.level === 'silent';
}

/**
 * Get simple presence acknowledgment
 */
export function getPresencePhrase(level: PresenceLevel): string {
  const openers = PRESENCE_OPENERS[level];
  if (openers.length === 0) return '';
  return seededPick(`${Date.now()}:319`, openers) ?? openers[0];
}
