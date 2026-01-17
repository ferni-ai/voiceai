/**
 * Context-to-Behavior Translator
 *
 * This module translates old-style context injections into behavioral signals.
 * It serves two purposes:
 *
 * 1. MIGRATION: Allow gradual conversion of existing builders
 * 2. FALLBACK: Handle any context that still uses the old format
 *
 * The translator parses context strings and extracts behavioral intent,
 * converting things like "[EMOTIONAL CONTEXT: User seems sad]" into
 * structured behavioral signals like { tone: 'gentle', style: 'supportive' }.
 *
 * @module intelligence/context-builders/behavioral/translator
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  BehavioralSignals,
  ToneModifier,
  StyleModifier,
  QuestionStyle,
  CallbackSignal,
} from './signals.js';
import { createCallback, createPresenceSignals, createCrisisSignals } from './signals.js';

const log = createLogger({ module: 'behavioral:translator' });

// ============================================================================
// PATTERN DEFINITIONS
// ============================================================================

/**
 * Patterns that indicate crisis mode
 */
const CRISIS_PATTERNS = [
  /\bcris(is|es)\b/i,
  /\bhigh\s*distress\b/i,
  /\bsuicid(e|al)\b/i,
  /\bself[- ]harm\b/i,
  /\bemergency\b/i,
  /\bsafety\s*first\b/i,
  /distress[:\s]+(?:9\d|100)%/i, // 90%+ distress
];

/**
 * Patterns that indicate presence/holding space
 */
const PRESENCE_PATTERNS = [
  /\bjust\s*be\s*present\b/i,
  /\bholding\s*space\b/i,
  /\bdon'?t\s*(?:try\s*to\s*)?(?:fix|solve|advise)\b/i,
  /\bslow\s*down\b/i,
  /\bgentle\b/i,
  /\bgive\s*(?:them\s*)?space\b/i,
];

/**
 * Patterns that indicate venting mode
 */
const VENTING_PATTERNS = [
  /\bventing\b/i,
  /\blisten(?:ing)?\s*more\s*than\s*speak/i,
  /\bnot\s*looking\s*for\s*(?:advice|solutions)\b/i,
  /\bjust\s*needs?\s*to\s*be\s*heard\b/i,
];

/**
 * Patterns that indicate celebration
 */
const CELEBRATION_PATTERNS = [
  /\bcelebrat(?:e|ion|ory)\b/i,
  /\bwin\b/i,
  /\bachiev(?:e|ement|ed)\b/i,
  /\bexcited?\b/i,
  /\bhappy\b/i,
  /\bpositive\b/i,
  /\bshare\s*(?:in\s*)?(?:their|the)\s*joy\b/i,
];

/**
 * Patterns that indicate empathy-first approach
 */
const EMPATHY_PATTERNS = [
  /\bempathy\s*first\b/i,
  /\bvalidat(?:e|ion)\s*(?:first|before)\b/i,
  /\backnowledge\s*(?:their\s*)?feelings?\b/i,
  /\bneeds?\s*(?:validation|support)\b/i,
];

/**
 * Patterns that indicate low energy user
 */
const LOW_ENERGY_PATTERNS = [
  /\blow\s*energy\b/i,
  /\btired\b/i,
  /\bexhaust(?:ed|ion)\b/i,
  /\bdepleted\b/i,
  /\bsubdued\b/i,
  /\bquiet(?:er)?\b/i,
];

/**
 * Patterns that indicate high energy user
 */
const HIGH_ENERGY_PATTERNS = [
  /\bhigh\s*energy\b/i,
  /\benthusiast(?:ic|m)\b/i,
  /\belevated\b/i,
  /\banimated\b/i,
  /\bupbeat\b/i,
];

/**
 * Patterns that indicate memory/callback opportunity
 */
const MEMORY_PATTERNS = [
  /\bmemory\s*callback\b/i,
  /\bcross[- ]session\s*memory\b/i,
  /\bearlier\s*(?:in\s*(?:this\s*)?conversation|today)\b/i,
  /\bprevious\s*conversation\b/i,
  /\byou\s*remember\b/i,
  /\bshared\s*history\b/i,
];

// ============================================================================
// EMOTION-TO-TONE MAPPING
// ============================================================================

const EMOTION_TO_TONE: Record<string, ToneModifier> = {
  // Negative emotions -> gentle/grounding
  sad: 'gentle',
  sadness: 'gentle',
  anxious: 'grounding',
  anxiety: 'grounding',
  fear: 'grounding',
  worried: 'grounding',
  frustrated: 'warm',
  angry: 'warm',
  grief: 'gentle',
  overwhelmed: 'grounding',

  // Positive emotions -> warm/energetic
  happy: 'warm',
  joy: 'celebratory',
  excited: 'energetic',
  hopeful: 'warm',
  grateful: 'warm',
  proud: 'celebratory',
  relieved: 'warm',

  // Neutral/processing
  confused: 'warm',
  curious: 'warm',
  thoughtful: 'contemplative',
  reflective: 'contemplative',
};

// ============================================================================
// TRANSLATOR FUNCTIONS
// ============================================================================

/**
 * Check if any pattern in array matches the text
 */
function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Extract emotion from context text
 */
function extractEmotion(text: string): string | null {
  // Look for "User seems <emotion>" or "feeling <emotion>" patterns
  const emotionPatterns = [
    /user\s+(?:seems?|is|feels?)\s+(\w+)/i,
    /feeling\s+(\w+)/i,
    /emotion(?:al)?:?\s*(\w+)/i,
    /mood:?\s*(\w+)/i,
  ];

  for (const pattern of emotionPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

/**
 * Extract topic from context text
 */
function extractTopic(text: string): string | null {
  const topicPatterns = [
    /(?:mentioned|discussed|talked\s+about|topic[:\s]+)\s*['"]?([^'".\n]+)['"]?/i,
    /about\s+['"]?([^'".\n]{3,30})['"]?/i,
  ];

  for (const pattern of topicPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Translate a single context injection string into behavioral signals
 */
export function translateContextToSignals(
  contextString: string,
  source = 'legacy'
): BehavioralSignals {
  const signals: BehavioralSignals = {
    source,
    confidence: 0.7, // Lower confidence for translated signals
  };

  // Check for special modes first (highest priority)

  // Crisis mode
  if (matchesAny(contextString, CRISIS_PATTERNS)) {
    return {
      ...createCrisisSignals(),
      source,
    };
  }

  // Holding space / presence
  if (matchesAny(contextString, PRESENCE_PATTERNS)) {
    return {
      ...createPresenceSignals(),
      source,
    };
  }

  // Venting mode
  if (matchesAny(contextString, VENTING_PATTERNS)) {
    signals.style = 'listening';
    signals.questionStyle = 'none';
    signals.length = 'brief';
    signals.modes = { ventingMode: true };
  }

  // Celebration mode
  if (matchesAny(contextString, CELEBRATION_PATTERNS)) {
    signals.tone = 'celebratory';
    signals.energy = 'elevated';
    signals.style = 'celebratory';
    signals.modes = { ...signals.modes, celebrationMode: true };
  }

  // Empathy-first approach
  if (matchesAny(contextString, EMPATHY_PATTERNS)) {
    signals.tone = 'gentle';
    signals.style = 'supportive';
    signals.questionStyle = 'reflective';
  }

  // Energy level
  if (matchesAny(contextString, LOW_ENERGY_PATTERNS)) {
    signals.energy = 'subdued';
    signals.pace = 'slow';
    signals.length = 'brief';
  } else if (matchesAny(contextString, HIGH_ENERGY_PATTERNS)) {
    signals.energy = 'elevated';
  }

  // Extract emotion and map to tone
  const emotion = extractEmotion(contextString);
  if (emotion && EMOTION_TO_TONE[emotion] && !signals.tone) {
    signals.tone = EMOTION_TO_TONE[emotion];
  }

  // Memory callbacks
  if (matchesAny(contextString, MEMORY_PATTERNS)) {
    const topic = extractTopic(contextString);
    const hint = topic
      ? `Earlier mention of "${topic}" could be woven in naturally.`
      : 'There may be something from earlier to reference.';

    signals.callbacks = [createCallback('thread', hint, 'natural')];
  }

  // Default tone if nothing detected
  if (!signals.tone) {
    signals.tone = 'warm';
  }

  return signals;
}

/**
 * Translate multiple context injections into aggregated signals
 */
export function translateContextsToSignals(
  contexts: Array<{ content: string; source?: string; priority?: number }>
): BehavioralSignals[] {
  return contexts.map((ctx) => {
    const signals = translateContextToSignals(ctx.content, ctx.source || 'legacy');

    // Apply priority from original context
    if (ctx.priority !== undefined) {
      signals.priority = ctx.priority;
    }

    return signals;
  });
}

// ============================================================================
// WRAPPER FOR LEGACY BUILDERS
// ============================================================================

import type { ContextBuilderInput, ContextInjection } from '../core/types.js';

/**
 * Wrap a legacy context builder to also emit behavioral signals.
 *
 * This allows gradual migration - the legacy builder still works,
 * but its output is also translated to behavioral signals.
 */
export function wrapLegacyBuilder(
  legacyBuild: (input: ContextBuilderInput) => Promise<ContextInjection[]>,
  builderName: string
): (input: ContextBuilderInput) => Promise<BehavioralSignals[]> {
  return async (input: ContextBuilderInput): Promise<BehavioralSignals[]> => {
    try {
      // Run the legacy builder
      const injections = await legacyBuild(input);

      // Translate each injection to behavioral signals
      const signals = injections.map((injection) => {
        const signal = translateContextToSignals(injection.content, builderName);

        // Map priority
        const priorityMap: Record<string, number> = {
          critical: 90,
          high: 70,
          standard: 50,
          hint: 30,
        };
        signal.priority = priorityMap[injection.priority] ?? 50;
        signal.confidence = injection.confidence ?? 0.7;

        return signal;
      });

      return signals;
    } catch (error) {
      log.warn({ builder: builderName, error }, 'Legacy builder failed, returning empty signals');
      return [];
    }
  };
}

// ============================================================================
// CONTEXT SANITIZER
// ============================================================================

/**
 * Sanitize a context string to remove any raw facts that might leak.
 *
 * This is a safety net for any context that still makes it to the prompt.
 * It strips specific details while keeping behavioral intent.
 */
export function sanitizeContextForSafety(contextString: string): string {
  let sanitized = contextString;

  // Remove specific dates
  sanitized = sanitized.replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, '[date]');

  // Remove specific times
  sanitized = sanitized.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\b/g, '[time]');

  // Remove specific dollar amounts
  sanitized = sanitized.replace(/\$[\d,]+(?:\.\d{2})?/g, '[amount]');

  // Remove email addresses
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]');

  // Remove phone numbers
  sanitized = sanitized.replace(/\b\d{3}[.\-]?\d{3}[.\-]?\d{4}\b/g, '[phone]');

  // Remove proper nouns that might be names (capitalized words not at sentence start)
  // This is aggressive but safe
  sanitized = sanitized.replace(/(?<=[a-z]\s)[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g, '[name]');

  return sanitized;
}
