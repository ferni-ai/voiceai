/**
 * Silence Intelligence System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Understanding what different silences MEAN - not just detecting pauses,
 * but interpreting them. A 3-second silence after "I've been thinking about
 * leaving my job" is VERY different from silence after "What's for dinner?"
 *
 * Real friends understand the weight of silence. They know when to wait,
 * when to gently prompt, and when to change the subject entirely.
 *
 * This is superhuman because most humans rush to fill silence uncomfortably.
 * Ferni understands silence as communication.
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SilenceIntelligence' });

// ============================================================================
// TYPES
// ============================================================================

export type SilenceType =
  | 'processing' // Thinking through what was said
  | 'emotional' // Feeling something deeply
  | 'resistant' // Avoiding or blocking
  | 'confused' // Not understanding
  | 'reflective' // Deep contemplation
  | 'dissociating' // Checking out / overwhelmed
  | 'comfortable' // Peaceful, content silence
  | 'searching' // Looking for words
  | 'testing' // Seeing if Ferni will fill it
  | 'unknown';

export type SilenceResponse =
  | 'wait' // Stay silent, let them process
  | 'gentle_prompt' // Soft invitation to continue
  | 'reflect_back' // Mirror what they said
  | 'change_topic' // Move to something lighter
  | 'ground_them' // Help them come back to present
  | 'validate' // Acknowledge the weight
  | 'offer_space' // "Take your time"
  | 'check_in'; // "Still with me?"

export interface SilenceAnalysis {
  /** Type of silence detected */
  type: SilenceType;

  /** Duration in milliseconds */
  duration: number;

  /** Confidence in classification (0-1) */
  confidence: number;

  /** What preceded the silence */
  precedingContent: {
    text: string;
    emotion: string;
    emotionIntensity: number;
    topic: string;
    wasQuestion: boolean;
    wasVulnerable: boolean;
    wasHeavy: boolean;
  };

  /** Recommended response */
  suggestedResponse: SilenceResponse;

  /** How long to wait before responding (ms) */
  waitDuration: number;

  /** If prompting, what to say */
  promptSuggestion?: string;

  /** Additional guidance for LLM */
  guidance: string;
}

export interface SilencePattern {
  /** User ID */
  userId: string;

  /** Average silence duration when processing */
  avgProcessingDuration: number;

  /** Average silence duration when emotional */
  avgEmotionalDuration: number;

  /** How they typically break silence */
  breakPatterns: {
    selfInitiated: number; // % they break themselves
    needsPrompt: number; // % they need prompting
    changesSubject: number; // % they redirect
  };

  /** Topics that cause longer silences */
  heavyTopics: string[];

  /** Times when they're more contemplative */
  contemplativeHours: number[];

  /** Total silences observed */
  observationCount: number;
}

// ============================================================================
// SILENCE TYPE DETECTION
// ============================================================================

/**
 * Heavy topics that often cause meaningful silence
 */
const HEAVY_TOPICS = [
  'death',
  'loss',
  'grief',
  'divorce',
  'breakup',
  'abuse',
  'trauma',
  'suicide',
  'addiction',
  'health',
  'diagnosis',
  'job loss',
  'failure',
  'regret',
  'guilt',
  'shame',
  'fear',
  'loneliness',
  'family conflict',
  'childhood',
  'parent',
  'father',
  'mother',
];

/**
 * Vulnerable phrases that warrant careful silence handling
 */
const VULNERABLE_PATTERNS = [
  /i('ve)?\s+never\s+(told|shared|admitted)/i,
  /this is (hard|difficult)/i,
  /i('m| am)\s+(scared|afraid|terrified)/i,
  /i\s+don't\s+know\s+(if|what|how|why)/i,
  /i('ve)?\s+been\s+(thinking|wondering)/i,
  /sometimes\s+i\s+(feel|think|wonder)/i,
  /what\s+if/i,
  /i\s+wish/i,
  /i\s+regret/i,
  /i\s+feel\s+(so\s+)?(alone|lonely|lost)/i,
];

/**
 * Patterns indicating confusion
 */
const CONFUSION_PATTERNS = [
  /i\s+don't\s+(understand|get|follow)/i,
  /what\s+do\s+you\s+mean/i,
  /can\s+you\s+explain/i,
  /i'm\s+(confused|lost)/i,
  /huh\??/i,
  /wait,?\s+what/i,
];

/**
 * Patterns indicating resistance
 */
const RESISTANCE_PATTERNS = [
  /i\s+don't\s+want\s+to\s+talk\s+about/i,
  /can\s+we\s+(talk|move|change)/i,
  /anyway/i,
  /whatever/i,
  /it\s+doesn't\s+matter/i,
  /let's\s+not/i,
  /i\s+don't\s+know/i, // When repeated
];

/**
 * Analyze a silence based on context
 */
export function analyzeSilence(
  durationMs: number,
  precedingText: string,
  precedingEmotion: string,
  precedingEmotionIntensity: number,
  precedingTopics: string[],
  wasQuestion: boolean,
  userPatterns?: SilencePattern
): SilenceAnalysis {
  // Detect context flags
  const isVulnerable = VULNERABLE_PATTERNS.some((p) => p.test(precedingText));
  const isHeavy =
    HEAVY_TOPICS.some((t) => precedingTopics.some((pt) => pt.toLowerCase().includes(t))) ||
    precedingEmotionIntensity > 0.7;
  const isConfused = CONFUSION_PATTERNS.some((p) => p.test(precedingText));
  const isResistant = RESISTANCE_PATTERNS.some((p) => p.test(precedingText));

  // Classify silence type
  let type: SilenceType = 'unknown';
  let confidence = 0.5;

  // Short silences (< 2 seconds)
  if (durationMs < 2000) {
    type = 'processing';
    confidence = 0.8;
  }
  // Medium silences (2-5 seconds)
  else if (durationMs < 5000) {
    if (isVulnerable || isHeavy) {
      type = 'emotional';
      confidence = 0.75;
    } else if (isConfused) {
      type = 'confused';
      confidence = 0.7;
    } else if (isResistant) {
      type = 'resistant';
      confidence = 0.65;
    } else if (wasQuestion) {
      type = 'searching';
      confidence = 0.7;
    } else {
      type = 'processing';
      confidence = 0.6;
    }
  }
  // Long silences (5-10 seconds)
  else if (durationMs < 10000) {
    if (isVulnerable || isHeavy) {
      type = 'emotional';
      confidence = 0.8;
    } else if (precedingEmotionIntensity > 0.8) {
      type = 'dissociating';
      confidence = 0.6;
    } else if (isResistant) {
      type = 'resistant';
      confidence = 0.75;
    } else {
      type = 'reflective';
      confidence = 0.65;
    }
  }
  // Very long silences (> 10 seconds)
  else {
    if (precedingEmotionIntensity > 0.7) {
      type = 'dissociating';
      confidence = 0.7;
    } else if (isHeavy) {
      type = 'emotional';
      confidence = 0.7;
    } else {
      type = 'testing';
      confidence = 0.5;
    }
  }

  // Adjust based on user patterns if available
  if (userPatterns && userPatterns.observationCount > 5) {
    // If this duration is normal for them when processing, reclassify
    if (
      Math.abs(durationMs - userPatterns.avgProcessingDuration) <
      userPatterns.avgProcessingDuration * 0.3
    ) {
      if (type === 'emotional' || type === 'dissociating') {
        type = 'processing';
        confidence *= 0.9;
      }
    }
    // If this is much longer than their normal, increase concern
    if (durationMs > userPatterns.avgProcessingDuration * 2) {
      confidence += 0.1;
    }
  }

  // Determine response
  const { response, waitDuration, prompt } = determineSilenceResponse(
    type,
    durationMs,
    isVulnerable,
    isHeavy,
    wasQuestion,
    userPatterns
  );

  // Build guidance
  const guidance = buildSilenceGuidance(type, precedingText, precedingTopics, isVulnerable);

  return {
    type,
    duration: durationMs,
    confidence: Math.min(1, confidence),
    precedingContent: {
      text: precedingText.substring(0, 200),
      emotion: precedingEmotion,
      emotionIntensity: precedingEmotionIntensity,
      topic: precedingTopics[0] || 'general',
      wasQuestion,
      wasVulnerable: isVulnerable,
      wasHeavy: isHeavy,
    },
    suggestedResponse: response,
    waitDuration,
    promptSuggestion: prompt,
    guidance,
  };
}

/**
 * Determine how to respond to a silence
 */
function determineSilenceResponse(
  type: SilenceType,
  durationMs: number,
  isVulnerable: boolean,
  isHeavy: boolean,
  wasQuestion: boolean,
  userPatterns?: SilencePattern
): { response: SilenceResponse; waitDuration: number; prompt?: string } {
  const baseWait = Math.min(durationMs * 0.5, 3000); // Wait up to 3 more seconds

  switch (type) {
    case 'processing':
      return {
        response: 'wait',
        waitDuration: baseWait,
      };

    case 'emotional':
      if (durationMs > 8000) {
        return {
          response: 'validate',
          waitDuration: 1000,
          prompt: "That's a lot to sit with.",
        };
      }
      return {
        response: 'offer_space',
        waitDuration: 2000,
        prompt: 'Take your time.',
      };

    case 'resistant':
      return {
        response: 'change_topic',
        waitDuration: 1500,
        prompt: "We don't have to go there. What else is on your mind?",
      };

    case 'confused':
      return {
        response: 'check_in',
        waitDuration: 1000,
        prompt: 'Does that make sense, or should I explain it differently?',
      };

    case 'reflective':
      if (isVulnerable) {
        return {
          response: 'wait',
          waitDuration: baseWait + 2000,
        };
      }
      return {
        response: 'gentle_prompt',
        waitDuration: 2000,
        prompt: "What's coming up for you?",
      };

    case 'dissociating':
      return {
        response: 'ground_them',
        waitDuration: 500,
        prompt: "Hey, I'm still here with you. Take a breath.",
      };

    case 'comfortable':
      return {
        response: 'wait',
        waitDuration: baseWait,
      };

    case 'searching':
      if (wasQuestion && durationMs > 5000) {
        return {
          response: 'offer_space',
          waitDuration: 1500,
          prompt: "It's okay if you don't have an answer right now.",
        };
      }
      return {
        response: 'wait',
        waitDuration: baseWait,
      };

    case 'testing':
      return {
        response: 'wait',
        waitDuration: Math.min(baseWait, 2000),
      };

    default:
      return {
        response: 'wait',
        waitDuration: 2000,
      };
  }
}

/**
 * Build guidance string for LLM
 */
function buildSilenceGuidance(
  type: SilenceType,
  precedingText: string,
  topics: string[],
  isVulnerable: boolean
): string {
  const guidance: string[] = [];

  switch (type) {
    case 'processing':
      guidance.push('[SILENCE] User is processing. Let them think.');
      break;

    case 'emotional':
      guidance.push('[SILENCE] Emotional silence detected. Be present, not problem-solving.');
      guidance.push("Don't rush to fill this space. Your presence is the support.");
      break;

    case 'resistant':
      guidance.push('[SILENCE] User may be avoiding this topic.');
      guidance.push('Respect their boundary. Offer an exit but leave the door open.');
      break;

    case 'confused':
      guidance.push('[SILENCE] User seems confused. Try a different angle.');
      break;

    case 'reflective':
      guidance.push('[SILENCE] Deep reflection happening. Honor this contemplative moment.');
      if (isVulnerable) {
        guidance.push('They shared something vulnerable. Let that land before responding.');
      }
      break;

    case 'dissociating':
      guidance.push('[URGENT] User may be overwhelmed. Gently bring them back.');
      guidance.push('Use grounding language: present moment, physical sensations, your presence.');
      break;

    case 'searching':
      guidance.push('[SILENCE] User is searching for words. Give them space to find them.');
      break;

    case 'testing':
      guidance.push('[SILENCE] User may be testing if you can hold silence.');
      guidance.push("Don't rush. Comfortable silence is a sign of trust.");
      break;

    default:
      guidance.push('[SILENCE] Pause detected. Match their pace.');
  }

  return guidance.join('\n');
}

// ============================================================================
// PATTERN LEARNING
// ============================================================================

const userPatterns = new Map<string, SilencePattern>();

/**
 * Get silence patterns for a user
 */
export function getSilencePattern(userId: string): SilencePattern | undefined {
  return userPatterns.get(userId);
}

/**
 * Record a silence observation
 */
export function recordSilence(
  userId: string,
  analysis: SilenceAnalysis,
  howBroken: 'self' | 'prompted' | 'redirect'
): void {
  let pattern = userPatterns.get(userId);

  if (!pattern) {
    pattern = {
      userId,
      avgProcessingDuration: 2000,
      avgEmotionalDuration: 5000,
      breakPatterns: {
        selfInitiated: 0.5,
        needsPrompt: 0.3,
        changesSubject: 0.2,
      },
      heavyTopics: [],
      contemplativeHours: [],
      observationCount: 0,
    };
    userPatterns.set(userId, pattern);
  }

  // Update averages with exponential moving average
  const alpha = 0.2;

  if (analysis.type === 'processing') {
    pattern.avgProcessingDuration =
      alpha * analysis.duration + (1 - alpha) * pattern.avgProcessingDuration;
  } else if (analysis.type === 'emotional') {
    pattern.avgEmotionalDuration =
      alpha * analysis.duration + (1 - alpha) * pattern.avgEmotionalDuration;
  }

  // Update break patterns
  const breakAlpha = 0.1;
  if (howBroken === 'self') {
    pattern.breakPatterns.selfInitiated =
      breakAlpha + (1 - breakAlpha) * pattern.breakPatterns.selfInitiated;
    pattern.breakPatterns.needsPrompt = (1 - breakAlpha) * pattern.breakPatterns.needsPrompt;
    pattern.breakPatterns.changesSubject = (1 - breakAlpha) * pattern.breakPatterns.changesSubject;
  } else if (howBroken === 'prompted') {
    pattern.breakPatterns.needsPrompt =
      breakAlpha + (1 - breakAlpha) * pattern.breakPatterns.needsPrompt;
    pattern.breakPatterns.selfInitiated = (1 - breakAlpha) * pattern.breakPatterns.selfInitiated;
  } else {
    pattern.breakPatterns.changesSubject =
      breakAlpha + (1 - breakAlpha) * pattern.breakPatterns.changesSubject;
    pattern.breakPatterns.selfInitiated = (1 - breakAlpha) * pattern.breakPatterns.selfInitiated;
  }

  // Track heavy topics
  if (
    analysis.precedingContent.wasHeavy &&
    analysis.duration > 5000 &&
    !pattern.heavyTopics.includes(analysis.precedingContent.topic)
  ) {
    pattern.heavyTopics.push(analysis.precedingContent.topic);
    if (pattern.heavyTopics.length > 10) {
      pattern.heavyTopics.shift();
    }
  }

  // Track contemplative hours
  const hour = new Date().getHours();
  if (
    analysis.type === 'reflective' &&
    analysis.duration > 4000 &&
    !pattern.contemplativeHours.includes(hour)
  ) {
    pattern.contemplativeHours.push(hour);
    if (pattern.contemplativeHours.length > 5) {
      pattern.contemplativeHours.shift();
    }
  }

  pattern.observationCount++;

  log.debug({ userId, type: analysis.type, duration: analysis.duration }, '🤫 Silence recorded');
}

/**
 * Format silence analysis for prompt injection
 */
export function formatSilenceForPrompt(analysis: SilenceAnalysis): string {
  const lines = [analysis.guidance];

  if (analysis.promptSuggestion) {
    lines.push(`If you speak, consider: "${analysis.promptSuggestion}"`);
  }

  if (analysis.suggestedResponse === 'wait') {
    lines.push("Best approach: Don't speak yet. Hold the space.");
  }

  return lines.join('\n');
}

// ============================================================================
// IMPORT/EXPORT (for persistence)
// ============================================================================

/**
 * Import a silence pattern into memory (for persistence)
 */
export function importSilencePattern(pattern: SilencePattern): void {
  userPatterns.set(pattern.userId, pattern);
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Reset all silence intelligence state (for testing)
 */
export function resetSilenceIntelligence(): void {
  userPatterns.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  analyzeSilence,
  getSilencePattern,
  recordSilence,
  formatSilenceForPrompt,
  resetSilenceIntelligence,
};
