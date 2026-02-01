/**
 * Emotional Momentum Constants
 *
 * Thresholds, intervention scripts, and trajectory definitions.
 *
 * @module @ferni/conversation/emotional-arc/momentum/constants
 */

import type { InterventionGuidance, EmotionalTrajectory } from './types.js';

// ============================================================================
// THRESHOLDS
// ============================================================================

export const THRESHOLDS = {
  /** Minimum valence shift to detect turning point */
  turningPointValenceShift: 0.15,

  /** Minimum snapshots to calculate trajectory */
  minSnapshotsForTrajectory: 3,

  /** Number of recent snapshots to use for trajectory */
  recentSnapshotWindow: 5,

  /** Volatility threshold (variance in valence) */
  volatilityThreshold: 0.3,

  /** Trend threshold for improving/declining */
  trendThreshold: 0.1,

  /** Number of declining turns before intervention */
  declineTurnsForIntervention: 3,

  /** Valence threshold for spiral-down detection */
  spiralDownValenceThreshold: -0.5,

  /** Session age (ms) before cleanup */
  sessionMaxAge: 2 * 60 * 60 * 1000, // 2 hours
};

// ============================================================================
// MAGNITUDE DEFINITIONS
// ============================================================================

export const MAGNITUDE_THRESHOLDS = {
  /** Slight shift */
  slight: { min: 0.15, max: 0.3 },
  /** Moderate shift */
  moderate: { min: 0.3, max: 0.5 },
  /** Significant shift */
  significant: { min: 0.5, max: 1.0 },
};

// ============================================================================
// INTERVENTION SCRIPTS
// ============================================================================

/**
 * Intervention scripts by type
 */
export const INTERVENTION_SCRIPTS: Record<InterventionGuidance['type'], string[]> = {
  redirect: [
    "Hey, I want to pause for a second. Let's take a breath together.",
    'Let me interrupt for a moment. How are you feeling right now?',
    "I notice we've been in some heavy territory. Want to shift gears for a bit?",
  ],
  validate: [
    'That sounds really heavy. How are you holding up right now?',
    'I hear you. This is a lot.',
    "That makes complete sense that you'd feel that way.",
  ],
  ground: [
    "Let's pause. Can you feel your feet on the floor?",
    "Take a breath with me. We're not going anywhere.",
    "I'm right here with you. Let's slow down for a second.",
  ],
  celebrate: [
    "That's wonderful! How does that feel?",
    'Yes! I love seeing you like this.',
    'This is so good to hear.',
  ],
  rest: [
    "We've covered a lot today. It's okay to rest here.",
    "You don't have to push through right now.",
    'Sometimes just sitting together is enough.',
  ],
};

// ============================================================================
// TRAJECTORY TO INTERVENTION MAPPING
// ============================================================================

/**
 * Map trajectory to default intervention type
 */
export const TRAJECTORY_INTERVENTION_MAP: Record<
  EmotionalTrajectory,
  InterventionGuidance['type'] | null
> = {
  'spiral-down': 'ground',
  declining: 'validate',
  volatile: 'redirect',
  'stable-negative': null, // May need intervention based on context
  'stable-positive': null,
  improving: null,
  recovering: null,
};

// ============================================================================
// EMOTION TO VALENCE MAPPING
// ============================================================================

/**
 * Map common emotions to approximate valence values
 */
export const EMOTION_VALENCE_MAP: Record<string, number> = {
  // Positive emotions
  happy: 0.7,
  joyful: 0.9,
  excited: 0.8,
  content: 0.5,
  calm: 0.3,
  hopeful: 0.6,
  grateful: 0.7,
  proud: 0.6,
  loved: 0.8,
  peaceful: 0.5,
  amused: 0.5,
  confident: 0.5,

  // Neutral
  neutral: 0.0,

  // Negative emotions
  sad: -0.5,
  anxious: -0.4,
  stressed: -0.4,
  frustrated: -0.5,
  angry: -0.6,
  fearful: -0.6,
  afraid: -0.6,
  worried: -0.3,
  overwhelmed: -0.6,
  hopeless: -0.8,
  lonely: -0.5,
  ashamed: -0.6,
  guilty: -0.4,
  raw: -0.7,
  hurt: -0.6,
  disappointed: -0.4,
  exhausted: -0.5,
};

/**
 * Get valence from emotion string
 */
export function emotionToValence(emotion: string): number {
  const normalized = emotion.toLowerCase().trim();
  return EMOTION_VALENCE_MAP[normalized] ?? 0;
}

// ============================================================================
// RISK FACTOR PATTERNS
// ============================================================================

/**
 * Patterns that indicate risk factors
 */
export const RISK_FACTOR_PATTERNS = {
  /** Multiple negative emotions in sequence */
  consecutiveNegative: 3,

  /** Rapid valence changes */
  rapidChangeThreshold: 0.4,

  /** Topics that commonly trigger negative emotions */
  sensitiveTopics: ['work', 'family', 'relationship', 'health', 'money', 'loss', 'death', 'trauma'],
};
