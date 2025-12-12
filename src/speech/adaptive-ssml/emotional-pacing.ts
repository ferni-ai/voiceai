/**
 * Emotional Pacing
 *
 * Adds natural pauses and softer tone when responding to heavy/emotional topics.
 * Creates the feeling of a thoughtful, empathetic response.
 *
 * - Grief/loss → longer initial pause, softer opening
 * - Major decisions → pause for weight
 * - Vulnerability → gentle receiving pause
 * - Heavy confession → "let me sit with that" pause
 *
 * @module speech/adaptive-ssml/emotional-pacing
 */

// ============================================================================
// TYPES
// ============================================================================

export interface EmotionalPacingContext {
  /** User's primary emotion */
  userEmotion?: string;
  /** Topics detected in the message */
  topics?: string[];
  /** The user's message (to detect heavy content) */
  userMessage?: string;
  /** Is this a first-time share of something vulnerable? */
  isVulnerableShare?: boolean;
}

export interface EmotionalPacingOptions {
  /** Initial pause duration for heavy topics (default 400ms) */
  heavyPauseMs?: number;
  /** Initial pause for moderate topics (default 250ms) */
  moderatePauseMs?: number;
  /** Volume reduction for opening (default 0.85) */
  openingVolumeRatio?: number;
  /** Skip if already has leading break */
  skipIfHasBreak?: boolean;
}

export interface EmotionalPacingResult {
  text: string;
  applied: boolean;
  reason: string;
  pauseMs: number;
}

// ============================================================================
// HEAVY TOPIC DETECTION
// ============================================================================

const HEAVY_EMOTIONS = new Set([
  'grief',
  'loss',
  'devastated',
  'heartbroken',
  'traumatized',
  'terrified',
  'hopeless',
  'despair',
  'suicidal',
  'crisis',
]);

const MODERATE_EMOTIONS = new Set([
  'sad',
  'anxious',
  'scared',
  'worried',
  'overwhelmed',
  'frustrated',
  'hurt',
  'lonely',
  'ashamed',
  'guilty',
]);

const HEAVY_TOPIC_PATTERNS = [
  // Loss/death
  /\b(died|death|passed away|lost (my|a)|funeral|cancer|terminal)\b/i,
  // Relationship crises
  /\b(divorce|breakup|cheated|left me|affair)\b/i,
  // Major life disruptions
  /\b(fired|laid off|bankruptcy|homeless|evicted)\b/i,
  // Health crises
  /\b(diagnosed|surgery|hospitalized|miscarriage|accident)\b/i,
  // Mental health
  /\b(depressed|suicidal|panic attack|breakdown|can't go on)\b/i,
  // Abuse/trauma
  /\b(abuse|assault|trauma|ptsd|violated)\b/i,
];

const MODERATE_TOPIC_PATTERNS = [
  // Work stress
  /\b(stressed|overwhelmed|burning out|can't cope)\b/i,
  // Relationship tension
  /\b(fight|argument|not talking|tension|conflict)\b/i,
  // Uncertainty
  /\b(don't know what to do|at a loss|confused|scared about)\b/i,
  // Self-doubt
  /\b(failure|not good enough|imposter|worthless)\b/i,
];

// ============================================================================
// CORE FUNCTION
// ============================================================================

/**
 * Apply emotional pacing to response based on the weight of the topic.
 *
 * @param text - The response text to modify
 * @param context - Context about the user's emotional state and message
 * @param options - Configuration options
 * @returns Modified text with appropriate pauses and result info
 */
export function applyEmotionalPacing(
  text: string,
  context: EmotionalPacingContext,
  options: EmotionalPacingOptions = {}
): EmotionalPacingResult {
  const {
    heavyPauseMs = 400,
    moderatePauseMs = 250,
    openingVolumeRatio = 0.85,
    skipIfHasBreak = true,
  } = options;

  // Skip if already has a leading break
  if (skipIfHasBreak && text.trimStart().startsWith('<break')) {
    return { text, applied: false, reason: 'already has leading break', pauseMs: 0 };
  }

  const emotion = context.userEmotion?.toLowerCase() || '';
  const message = context.userMessage || '';

  // Determine weight level
  let isHeavy = false;
  let isModerate = false;
  let reason = '';

  // Check emotion first
  if (HEAVY_EMOTIONS.has(emotion)) {
    isHeavy = true;
    reason = `heavy emotion: ${emotion}`;
  } else if (MODERATE_EMOTIONS.has(emotion)) {
    isModerate = true;
    reason = `moderate emotion: ${emotion}`;
  }

  // Check message content for heavy topics
  if (!isHeavy && message) {
    for (const pattern of HEAVY_TOPIC_PATTERNS) {
      if (pattern.test(message)) {
        isHeavy = true;
        reason = 'heavy topic detected';
        break;
      }
    }
  }

  // Check for moderate topics
  if (!isHeavy && !isModerate && message) {
    for (const pattern of MODERATE_TOPIC_PATTERNS) {
      if (pattern.test(message)) {
        isModerate = true;
        reason = 'moderate topic detected';
        break;
      }
    }
  }

  // Check for vulnerable share
  if (context.isVulnerableShare && !isHeavy) {
    isModerate = true;
    reason = 'vulnerable share';
  }

  // Apply appropriate pacing
  if (isHeavy) {
    // Heavy: longer pause + softer volume + gentle opening
    const prefix = `<break time="${heavyPauseMs}ms"/><volume ratio="${openingVolumeRatio}"/>`;
    return {
      text: prefix + text,
      applied: true,
      reason,
      pauseMs: heavyPauseMs,
    };
  }

  if (isModerate) {
    // Moderate: medium pause only
    const prefix = `<break time="${moderatePauseMs}ms"/>`;
    return {
      text: prefix + text,
      applied: true,
      reason,
      pauseMs: moderatePauseMs,
    };
  }

  // No heavy content detected
  return { text, applied: false, reason: 'no heavy content', pauseMs: 0 };
}

/**
 * Check if a message contains heavy emotional content
 */
export function isHeavyContent(message: string, emotion?: string): boolean {
  if (emotion && HEAVY_EMOTIONS.has(emotion.toLowerCase())) {
    return true;
  }
  return HEAVY_TOPIC_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Check if text already has emotional pacing applied
 */
export function hasEmotionalPacing(text: string): boolean {
  // Check for break tag at the start with 200ms+ pause
  const match = text.match(/^<break time="(\d+)ms"/);
  if (match) {
    const pauseMs = parseInt(match[1], 10);
    return pauseMs >= 200;
  }
  return false;
}
