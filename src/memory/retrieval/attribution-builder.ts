/**
 * Memory Attribution Builder
 *
 * Phase 16: Memory Confidence & Attribution
 *
 * Builds natural attribution phrases for surfaced memories:
 * - "You told me [when] that..."
 * - "A few weeks ago, you mentioned..."
 * - "If I remember correctly, you said..."
 *
 * @module memory/retrieval/attribution-builder
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ConfidenceLevel } from './confidence-scoring.js';

const log = createLogger({ module: 'AttributionBuilder' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Attribution for a memory
 */
export interface MemoryAttribution {
  /** Full attribution phrase */
  phrase: string;
  /** Confidence phrase component */
  confidencePrefix: string;
  /** Time phrase component */
  timePhrase: string;
  /** Context phrase (topic, person, etc.) */
  contextPhrase?: string;
  /** Whether to include the full memory content */
  includeContent: boolean;
}

/**
 * Input for attribution building
 */
export interface AttributionInput {
  /** Memory content */
  content: string;
  /** Confidence level */
  confidenceLevel: ConfidenceLevel;
  /** When the memory was captured */
  capturedAt: Date;
  /** Topic context */
  topic?: string;
  /** Person involved */
  personInvolved?: string;
  /** Whether this was user-initiated or Ferni surfacing */
  surfacingContext: 'user_asked' | 'proactive' | 'triggered';
  /** Persona surfacing the memory */
  personaId?: string;
}

// ============================================================================
// CONFIDENCE PREFIXES
// ============================================================================

const CONFIDENCE_PREFIXES: Record<ConfidenceLevel, string[]> = {
  high: ['You told me', 'You mentioned', 'You said', 'You shared'],
  medium: [
    'I remember you saying',
    'I recall you mentioning',
    'From what I remember,',
    'You mentioned something about',
  ],
  low: [
    'I think you said',
    'If I remember correctly,',
    'I believe you mentioned',
    'I seem to recall',
  ],
  uncertain: [
    'I may be misremembering, but',
    "I'm not entirely sure, but",
    "Correct me if I'm wrong, but",
    'I have a vague memory of',
  ],
};

// ============================================================================
// TIME PHRASES
// ============================================================================

/**
 * Get time phrase based on how long ago
 */
function getTimePhrase(capturedAt: Date): string {
  const daysSince = Math.floor((Date.now() - capturedAt.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSince === 0) {
    return 'earlier today';
  } else if (daysSince === 1) {
    return 'yesterday';
  } else if (daysSince < 7) {
    return `${daysSince} days ago`;
  } else if (daysSince < 14) {
    return 'about a week ago';
  } else if (daysSince < 21) {
    return 'a couple weeks ago';
  } else if (daysSince < 30) {
    return 'a few weeks ago';
  } else if (daysSince < 45) {
    return 'about a month ago';
  } else if (daysSince < 60) {
    return 'a month or so ago';
  } else if (daysSince < 90) {
    return 'a couple months ago';
  } else if (daysSince < 180) {
    return 'a few months ago';
  } else if (daysSince < 365) {
    return 'several months ago';
  } else {
    const years = Math.floor(daysSince / 365);
    return years === 1 ? 'about a year ago' : `about ${years} years ago`;
  }
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build a natural attribution phrase for a memory.
 *
 * This is the main function for creating the "You told me..." phrases
 * that make memory surfacing feel human and appropriate.
 */
export function buildAttribution(input: AttributionInput): MemoryAttribution {
  // 1. Get confidence prefix
  const prefixes = CONFIDENCE_PREFIXES[input.confidenceLevel];
  const confidencePrefix = prefixes[Math.floor(Math.random() * prefixes.length)];

  // 2. Get time phrase
  const timePhrase = getTimePhrase(input.capturedAt);

  // 3. Build context phrase
  const contextPhrase = buildContextPhrase(input);

  // 4. Build full phrase based on surfacing context
  const phrase = buildFullPhrase(
    confidencePrefix,
    timePhrase,
    contextPhrase,
    input.content,
    input.surfacingContext,
    input.confidenceLevel
  );

  // Determine if we should include full content
  const includeContent = input.confidenceLevel !== 'uncertain';

  log.debug(
    {
      confidenceLevel: input.confidenceLevel,
      surfacingContext: input.surfacingContext,
      phraseLength: phrase.length,
    },
    '📝 Attribution built'
  );

  return {
    phrase,
    confidencePrefix,
    timePhrase,
    contextPhrase,
    includeContent,
  };
}

/**
 * Build context phrase from topic/person
 */
function buildContextPhrase(input: AttributionInput): string | undefined {
  const parts: string[] = [];

  if (input.topic) {
    parts.push(`when we were talking about ${input.topic}`);
  }

  if (input.personInvolved) {
    if (parts.length === 0) {
      parts.push(`about ${input.personInvolved}`);
    } else {
      parts.push(`and ${input.personInvolved}`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Build the full attribution phrase
 */
function buildFullPhrase(
  confidencePrefix: string,
  timePhrase: string,
  contextPhrase: string | undefined,
  content: string,
  surfacingContext: 'user_asked' | 'proactive' | 'triggered',
  confidenceLevel: ConfidenceLevel
): string {
  // Different patterns based on surfacing context
  switch (surfacingContext) {
    case 'user_asked':
      // User asked about something - more direct
      if (contextPhrase) {
        return `${confidencePrefix} ${timePhrase}, ${contextPhrase}, ${cleanContent(content)}`;
      }
      return `${confidencePrefix} ${timePhrase} ${cleanContent(content)}`;

    case 'proactive':
      // Proactively surfacing - softer intro
      if (confidenceLevel === 'high' || confidenceLevel === 'medium') {
        if (contextPhrase) {
          return `I was thinking about something... ${confidencePrefix} ${timePhrase}, ${contextPhrase}, ${cleanContent(content)}`;
        }
        return `I was thinking about something... ${confidencePrefix} ${timePhrase} ${cleanContent(content)}`;
      } else {
        // Lower confidence proactive = even softer
        return `I might be remembering this wrong, but ${timePhrase}, ${cleanContent(content)}`;
      }

    case 'triggered':
      // Triggered by something user said - conversational
      if (contextPhrase) {
        return `That reminds me - ${confidencePrefix.toLowerCase()} ${timePhrase}, ${contextPhrase}, ${cleanContent(content)}`;
      }
      return `That reminds me - ${confidencePrefix.toLowerCase()} ${timePhrase} ${cleanContent(content)}`;

    default:
      return `${confidencePrefix} ${timePhrase} ${cleanContent(content)}`;
  }
}

/**
 * Clean content for inclusion in phrase
 */
function cleanContent(content: string): string {
  // Remove leading/trailing whitespace
  let cleaned = content.trim();

  // Ensure it doesn't start with a capital if it's mid-sentence
  // (Only lowercase if it's not a proper noun indicator)
  if (cleaned.length > 0 && /^[A-Z][^A-Z]/.test(cleaned)) {
    cleaned = cleaned[0].toLowerCase() + cleaned.slice(1);
  }

  // Ensure it ends appropriately
  if (!cleaned.endsWith('.') && !cleaned.endsWith('?') && !cleaned.endsWith('!')) {
    cleaned += '.';
  }

  return cleaned;
}

// ============================================================================
// QUICK ATTRIBUTION
// ============================================================================

/**
 * Quick attribution for simple cases
 */
export function quickAttribution(
  content: string,
  capturedAt: Date,
  confidenceLevel: ConfidenceLevel = 'medium'
): string {
  const prefixes = CONFIDENCE_PREFIXES[confidenceLevel];
  const confidencePrefix = prefixes[0];
  const timePhrase = getTimePhrase(capturedAt);

  return `${confidencePrefix} ${timePhrase} ${cleanContent(content)}`;
}

/**
 * Get just the time phrase for a date
 */
export function getTimePhraseForDate(date: Date): string {
  return getTimePhrase(date);
}

// ============================================================================
// CORRECTION HANDLING
// ============================================================================

/**
 * Build a correction acknowledgment phrase
 */
export function buildCorrectionAcknowledgment(
  originalContent: string,
  correctedContent?: string
): string {
  const acknowledgments = [
    "Thank you for the correction. I've updated my notes.",
    'Got it - thanks for setting me straight!',
    'Ah, my mistake. Thanks for correcting me.',
    "I appreciate the correction - I'll remember that.",
  ];

  const ack = acknowledgments[Math.floor(Math.random() * acknowledgments.length)];

  if (correctedContent) {
    return `${ack} So it's actually: ${correctedContent}`;
  }

  return ack;
}

/**
 * Build a phrase for when user disputes a memory
 */
export function buildDisputeResponse(): string {
  const responses = [
    "I'm sorry, I must have gotten that wrong. Thanks for letting me know.",
    "Oh, my apologies! I'll make sure not to bring that up again.",
    'Thanks for the correction - I must have misremembered.',
    'I appreciate you setting me straight on that.',
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Build attributions for multiple memories
 */
export function buildBatchAttributions(inputs: AttributionInput[]): MemoryAttribution[] {
  return inputs.map((input) => buildAttribution(input));
}
