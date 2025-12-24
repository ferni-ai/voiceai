/**
 * Anti-Surveillance Language Filter
 *
 * > "Make them feel known, not tracked."
 *
 * Detects and blocks language patterns that make Ferni sound like
 * a surveillance app rather than a friend who notices.
 *
 * Philosophy:
 * - "I noticed" not "Our records show"
 * - "I keep thinking about" not "Based on your data"
 * - Observations, not statistics
 * - Felt, not explained
 *
 * @module services/revelation-moments/anti-surveillance
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { LanguagePattern, SurveillanceCategory } from './types.js';

const log = createLogger({ module: 'anti-surveillance' });

// ============================================================================
// SURVEILLANCE PATTERNS
// ============================================================================

/**
 * Patterns that sound like surveillance/tracking
 */
export const SURVEILLANCE_PATTERNS: LanguagePattern[] = [
  // DATA REFERENCE
  {
    category: 'data_reference',
    pattern: /\b(our|my)\s+records?\s+show/i,
    alternative: 'I remember',
    severity: 'block',
  },
  {
    category: 'data_reference',
    pattern: /based\s+on\s+(your|the)\s+data/i,
    alternative: "From what I've seen",
    severity: 'block',
  },
  {
    category: 'data_reference',
    pattern: /according\s+to\s+(your|our|my|the)\s+(profile|records?|data)/i,
    alternative: 'I recall',
    severity: 'block',
  },
  {
    category: 'data_reference',
    pattern: /based\s+on\s+(our|my)\s+conversations?/i,
    alternative: "From what we've talked about",
    severity: 'block',
  },
  {
    category: 'data_reference',
    pattern: /your\s+(profile|data|history)\s+(indicates?|shows?|suggests?)/i,
    alternative: "I've noticed",
    severity: 'block',
  },

  // TRACKING LANGUAGE
  {
    category: 'tracking_language',
    pattern: /\b(we('ve)?|i('ve)?)\s+(been\s+)?(tracking|monitoring|logging)/i,
    alternative: "I've been paying attention to",
    severity: 'block',
  },
  {
    category: 'tracking_language',
    pattern: /\b(we|i)\s+(track|monitor|log)\s+(your|this)/i,
    severity: 'block',
  },
  {
    category: 'tracking_language',
    pattern: /in\s+(our|my)\s+system/i,
    severity: 'block',
  },
  {
    category: 'tracking_language',
    pattern: /stored\s+in\s+(our|my|your)\s+(database|records?|memory)/i,
    severity: 'block',
  },

  // STATISTICS
  {
    category: 'statistics',
    pattern: /\d+%\s+of\s+(your|the)\s+(conversations?|sessions?|time)/i,
    alternative: 'often',
    severity: 'block',
  },
  {
    category: 'statistics',
    pattern: /you('ve)?\s+(mentioned|talked\s+about|discussed)\s+\w+\s+\d+\s+times?/i,
    alternative: 'You often mention',
    severity: 'block',
  },
  {
    category: 'statistics',
    pattern: /in\s+\d+\s+(out\s+)?of\s+(\d+|your\s+last)\s+(conversations?|sessions?)/i,
    severity: 'block',
  },
  {
    category: 'statistics',
    pattern: /statistics?\s+(show|indicate|suggest)/i,
    severity: 'block',
  },
  {
    category: 'statistics',
    pattern: /on\s+average,?\s+you/i,
    severity: 'warn',
  },

  // DATABASE SPEAK
  {
    category: 'database_speak',
    pattern: /\b(our|my)\s+system\s+(detected|found|identified)/i,
    alternative: 'I noticed',
    severity: 'block',
  },
  {
    category: 'database_speak',
    pattern: /analysis\s+(shows?|indicates?|reveals?)/i,
    alternative: "I've been thinking",
    severity: 'block',
  },
  {
    category: 'database_speak',
    pattern: /\b(pattern|behavior)\s+recognition/i,
    severity: 'block',
  },
  {
    category: 'database_speak',
    pattern: /algorithm(ic)?|machine\s+learning|ai\s+detected/i,
    severity: 'block',
  },

  // FEATURE ANNOUNCEMENTS
  {
    category: 'feature_announce',
    pattern: /i\s+can\s+help\s+you\s+with/i,
    alternative: "What's on your mind?",
    severity: 'warn',
  },
  {
    category: 'feature_announce',
    pattern: /\b(my|our)\s+(capabilities|features?)\s+include/i,
    severity: 'block',
  },
  {
    category: 'feature_announce',
    pattern: /feel\s+free\s+to\s+ask\s+(me\s+)?(about|anything)/i,
    alternative: "I'm here",
    severity: 'warn',
  },
  {
    category: 'feature_announce',
    pattern: /i('m|\s+am)\s+(designed|programmed|built)\s+to/i,
    severity: 'block',
  },
  {
    category: 'feature_announce',
    pattern: /as\s+an?\s+(ai|assistant|coach|bot)/i,
    severity: 'block',
  },
];

// ============================================================================
// ALTERNATIVE PHRASINGS
// ============================================================================

/**
 * Human-sounding alternatives for common surveillance patterns
 */
export const HUMAN_ALTERNATIVES: Record<string, string[]> = {
  // Data references → Personal observations
  'our records show': ['I remember', 'I recall', 'That reminds me', "I've been thinking about"],
  'based on your data': [
    "From what I've seen",
    "From what you've shared",
    'Looking back at our talks',
  ],
  'your history indicates': ["I've noticed", "Something I've picked up on", 'Over time, I see'],

  // Tracking → Noticing
  "we've been tracking": [
    "I've been paying attention to",
    'I keep noticing',
    'It keeps coming up that',
  ],
  'monitoring your': ['watching', 'noticing', 'seeing'],

  // Statistics → Natural observations
  'in 80% of your sessions': ['often', 'pretty regularly', 'a lot of the time'],
  'you mentioned X 5 times': [
    'you often mention X',
    'X keeps coming up',
    "you've talked about X a few times",
  ],

  // Feature announcements → Being present
  'I can help you with': ["What's on your mind?", 'What brought you here today?', 'Tell me more'],
};

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Check text for surveillance-y language
 */
export function detectSurveillanceLanguage(text: string): Array<{
  pattern: LanguagePattern;
  match: string;
  index: number;
}> {
  const detections: Array<{
    pattern: LanguagePattern;
    match: string;
    index: number;
  }> = [];

  for (const pattern of SURVEILLANCE_PATTERNS) {
    const regex =
      typeof pattern.pattern === 'string'
        ? new RegExp(pattern.pattern, 'gi')
        : new RegExp(pattern.pattern.source, pattern.pattern.flags + 'g');

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      detections.push({
        pattern,
        match: match[0],
        index: match.index,
      });
    }
  }

  return detections;
}

/**
 * Check if text contains any blocking surveillance language
 */
export function containsBlockingSurveillance(text: string): boolean {
  const detections = detectSurveillanceLanguage(text);
  return detections.some((d) => d.pattern.severity === 'block');
}

/**
 * Get all surveillance issues in text
 */
export function getSurveillanceIssues(text: string): {
  hasBlocking: boolean;
  hasWarnings: boolean;
  issues: Array<{
    severity: 'block' | 'warn';
    match: string;
    alternative?: string;
    category: SurveillanceCategory;
  }>;
} {
  const detections = detectSurveillanceLanguage(text);

  return {
    hasBlocking: detections.some((d) => d.pattern.severity === 'block'),
    hasWarnings: detections.some((d) => d.pattern.severity === 'warn'),
    issues: detections.map((d) => ({
      severity: d.pattern.severity,
      match: d.match,
      alternative: d.pattern.alternative,
      category: d.pattern.category,
    })),
  };
}

// ============================================================================
// TRANSFORMATION
// ============================================================================

/**
 * Transform surveillance language to human language
 *
 * Note: This is a best-effort transformation. Some patterns may not
 * transform cleanly and should be manually reviewed.
 */
export function humanizeSurveillanceLanguage(text: string): {
  transformed: string;
  changes: Array<{ original: string; replacement: string }>;
} {
  let transformed = text;
  const changes: Array<{ original: string; replacement: string }> = [];

  const detections = detectSurveillanceLanguage(text);

  // Sort by index descending so we can replace from end to start
  detections.sort((a, b) => b.index - a.index);

  for (const detection of detections) {
    if (!detection.pattern.alternative) continue;

    const original = detection.match;
    const replacement = detection.pattern.alternative;

    transformed =
      transformed.slice(0, detection.index) +
      replacement +
      transformed.slice(detection.index + original.length);

    changes.push({ original, replacement });
  }

  if (changes.length > 0) {
    log.debug({ changeCount: changes.length }, '🔄 Humanized surveillance language');
  }

  return { transformed, changes };
}

// ============================================================================
// CONTEXT INJECTION
// ============================================================================

/**
 * Generate anti-surveillance guidance for context injection
 */
export function getAntiSurveillanceGuidance(): string {
  return `[ANTI-SURVEILLANCE - FEEL KNOWN, NOT TRACKED]

NEVER say:
❌ "Our records show..."
❌ "Based on your data..."
❌ "You've mentioned X 5 times..."
❌ "In 80% of your sessions..."
❌ "My system detected..."
❌ "I can help you with..."

ALWAYS say:
✅ "I remember when you..."
✅ "I've noticed..."
✅ "That keeps coming up..."
✅ "I've been thinking about..."
✅ "Something I picked up on..."

The goal: They feel KNOWN by a friend, not TRACKED by an app.

Frame everything as observation, not data retrieval.
Frame everything as relationship, not capability.`;
}

/**
 * Get quick anti-surveillance reminders for specific categories
 */
export function getAntiSurveillanceReminder(category: SurveillanceCategory): string {
  const reminders: Record<SurveillanceCategory, string> = {
    data_reference: 'Say "I remember" not "Our records show"',
    tracking_language: 'Say "I\'ve noticed" not "We\'ve been tracking"',
    statistics: 'Say "often" or "keeps coming up" not percentages or counts',
    database_speak: 'Say "I see" not "My system detected"',
    feature_announce: "Just BE helpful, don't ANNOUNCE what you can do",
  };
  return reminders[category];
}
