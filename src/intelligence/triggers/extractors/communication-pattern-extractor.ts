/**
 * Communication Pattern Extractor
 *
 * Phase 2: Personal Memory Integration
 *
 * Analyzes conversation text to detect communication patterns:
 * - Phrase patterns: How user expresses distress, deflection, etc.
 * - Temporal patterns: Late-night conversations, time-sensitive topics
 * - Interaction patterns: Response styles, topic transitions
 *
 * @module CommunicationPatternExtractor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  PhrasePattern,
  TemporalPattern,
  CommunicationPatterns,
} from '../user-trigger-profile.types.js';

const log = createLogger({ module: 'communication-pattern-extractor' });

// ============================================================================
// PHRASE PATTERN DETECTION
// ============================================================================

interface PhrasePatternDef {
  category: string;
  patterns: RegExp[];
  triggerCategory: string;
  emotionalWeight: number;
}

const PHRASE_PATTERN_DEFS: PhrasePatternDef[] = [
  // Distress expressions
  {
    category: 'distress',
    patterns: [
      /I(?:'m|\s+am)\s+(?:just\s+)?(?:so\s+)?(?:tired|exhausted|drained)/i,
      /I\s+can'?t\s+(?:do\s+this|take\s+it|handle|cope)/i,
      /(?:everything|it\s+all)\s+(?:feels|is)\s+(?:too\s+)?(?:much|overwhelming)/i,
      /I(?:'m|\s+am)\s+(?:at\s+)?(?:the\s+)?end\s+of\s+my\s+rope/i,
      /I\s+don'?t\s+know\s+(?:how\s+much\s+more|what\s+to\s+do)/i,
    ],
    triggerCategory: 'emotional',
    emotionalWeight: 0.8,
  },

  // Deflection expressions
  {
    category: 'deflection',
    patterns: [
      /I(?:'m|\s+am)\s+(?:just\s+)?fine/i,
      /it(?:'s|\s+is)\s+(?:not\s+)?(?:a\s+)?big\s+deal/i,
      /(?:don'?t|no\s+need\s+to)\s+worry\s+about\s+me/i,
      /I(?:'ll|\s+will)\s+(?:just\s+)?(?:figure\s+it\s+out|deal\s+with\s+it)/i,
      /let'?s\s+(?:just\s+)?talk\s+about\s+something\s+else/i,
      /(?:anyway|anyways),?\s+(?:how\s+are\s+you|enough\s+about\s+me)/i,
    ],
    triggerCategory: 'behavioral',
    emotionalWeight: 0.6,
  },

  // Self-criticism expressions
  {
    category: 'self_criticism',
    patterns: [
      /I(?:'m|\s+am)\s+(?:so\s+)?(?:stupid|dumb|an?\s+idiot)/i,
      /I\s+(?:always|never)\s+(?:mess|screw)\s+(?:things?\s+)?up/i,
      /(?:what(?:'s|\s+is))\s+wrong\s+with\s+me/i,
      /I\s+can'?t\s+do\s+anything\s+right/i,
      /I(?:'m|\s+am)\s+(?:such\s+)?a\s+(?:failure|loser|disappointment)/i,
    ],
    triggerCategory: 'emotional',
    emotionalWeight: 0.85,
  },

  // Hopelessness expressions
  {
    category: 'hopelessness',
    patterns: [
      /(?:what(?:'s|\s+is))\s+the\s+point/i,
      /nothing\s+(?:ever\s+)?(?:changes|works|matters)/i,
      /I\s+(?:give|gave)\s+up/i,
      /(?:there(?:'s|\s+is))\s+no\s+(?:hope|point|use)/i,
      /it(?:'ll|\s+will)\s+never\s+get\s+better/i,
    ],
    triggerCategory: 'existential',
    emotionalWeight: 0.9,
  },

  // Gratitude expressions
  {
    category: 'gratitude',
    patterns: [
      /(?:I(?:'m|\s+am)\s+)?(?:so\s+)?(?:grateful|thankful|blessed)/i,
      /this\s+means\s+(?:so\s+much|everything|a\s+lot)/i,
      /I\s+really\s+appreciate/i,
      /you(?:'ve|\s+have)\s+been\s+(?:so\s+)?(?:helpful|amazing)/i,
      /thank\s+(?:you|goodness)/i,
    ],
    triggerCategory: 'emotional',
    emotionalWeight: 0.3,
  },

  // Growth expressions
  {
    category: 'growth',
    patterns: [
      /I(?:'m|\s+am)\s+(?:trying\s+to|working\s+on)/i,
      /I\s+want\s+to\s+(?:be|become|get)\s+better/i,
      /I(?:'ve|\s+have)\s+been\s+(?:learning|growing|changing)/i,
      /I\s+need\s+to\s+(?:work\s+on|improve|change)/i,
      /I(?:'m|\s+am)\s+(?:ready|committed)\s+to/i,
    ],
    triggerCategory: 'growth',
    emotionalWeight: 0.5,
  },

  // Avoidance expressions
  {
    category: 'avoidance',
    patterns: [
      /I\s+don'?t\s+(?:want|need)\s+to\s+talk\s+about/i,
      /(?:can|let'?s)\s+(?:we\s+)?(?:just\s+)?(?:not|skip)/i,
      /I(?:'d|\s+would)\s+rather\s+not/i,
      /it(?:'s|\s+is)\s+(?:too\s+)?(?:complicated|hard\s+to\s+explain)/i,
      /maybe\s+(?:some\s+)?(?:other|another)\s+time/i,
    ],
    triggerCategory: 'behavioral',
    emotionalWeight: 0.65,
  },

  // Connection-seeking expressions
  {
    category: 'connection_seeking',
    patterns: [
      /I\s+(?:just\s+)?(?:need|want)\s+(?:someone\s+)?to\s+(?:talk|listen|vent)/i,
      /(?:can|will)\s+you\s+(?:just\s+)?(?:be\s+)?(?:here|with\s+me)/i,
      /I(?:'m|\s+am)\s+(?:feeling\s+)?(?:so\s+)?(?:alone|lonely)/i,
      /I\s+don'?t\s+have\s+anyone\s+(?:else\s+)?to\s+(?:talk|turn)\s+to/i,
      /you(?:'re|\s+are)\s+the\s+only\s+one\s+(?:who|I\s+can)/i,
    ],
    triggerCategory: 'relational',
    emotionalWeight: 0.75,
  },
];

// ============================================================================
// TEMPORAL PATTERN DETECTION
// ============================================================================

interface TemporalIndicator {
  pattern: RegExp;
  timeOfDay: 'late_night' | 'early_morning' | 'evening' | 'afternoon' | 'morning';
  significance: number;
}

const TEMPORAL_INDICATORS: TemporalIndicator[] = [
  { pattern: /can'?t\s+sleep/i, timeOfDay: 'late_night', significance: 0.8 },
  { pattern: /(?:2|3|4)\s*(?:am|a\.m\.)/i, timeOfDay: 'late_night', significance: 0.9 },
  { pattern: /middle\s+of\s+the\s+night/i, timeOfDay: 'late_night', significance: 0.85 },
  {
    pattern: /(?:still\s+)?awake\s+(?:at\s+)?(?:this\s+)?hour/i,
    timeOfDay: 'late_night',
    significance: 0.75,
  },
  {
    pattern: /before\s+(?:the\s+)?sun\s+(?:comes\s+)?up/i,
    timeOfDay: 'early_morning',
    significance: 0.6,
  },
  { pattern: /woke\s+up\s+early/i, timeOfDay: 'early_morning', significance: 0.5 },
  { pattern: /after\s+(?:work|dinner)/i, timeOfDay: 'evening', significance: 0.4 },
];

// ============================================================================
// EXTRACTION INTERFACES
// ============================================================================

export interface CommunicationPatternExtractionOptions {
  /** Minimum confidence to include patterns (0-1) */
  minConfidence?: number;
  /** Context time for temporal pattern matching */
  contextTime?: Date;
  /** Merge with existing patterns */
  existingPatterns?: CommunicationPatterns;
}

export interface CommunicationPatternExtractionResult {
  patterns: CommunicationPatterns;
  detectedCategories: string[];
  processingTimeMs: number;
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract communication patterns from conversation text
 */
export function extractCommunicationPatterns(
  text: string,
  options: CommunicationPatternExtractionOptions = {}
): CommunicationPatternExtractionResult {
  const startTime = Date.now();
  const { minConfidence = 0.4, contextTime, existingPatterns } = options;

  const phrasePatterns: PhrasePattern[] = existingPatterns?.phrasePatterns
    ? [...existingPatterns.phrasePatterns]
    : [];
  const temporalPatterns: TemporalPattern[] = existingPatterns?.temporalPatterns
    ? [...existingPatterns.temporalPatterns]
    : [];
  const detectedCategories: string[] = [];

  // Extract phrase patterns
  for (const patternDef of PHRASE_PATTERN_DEFS) {
    for (const pattern of patternDef.patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      const confidence = calculatePhraseConfidence(match, text);
      if (confidence < minConfidence) continue;

      // Check if we already have this phrase pattern
      const existingIndex = phrasePatterns.findIndex(
        (p) => p.phrase.toLowerCase() === match[0].toLowerCase()
      );

      if (existingIndex >= 0) {
        // Update frequency
        phrasePatterns[existingIndex].frequency++;
        phrasePatterns[existingIndex].lastUsed = new Date();
      } else {
        // Add new phrase pattern
        phrasePatterns.push({
          phrase: match[0],
          context: extractPhraseContext(text, match.index || 0),
          frequency: 1,
          firstUsed: new Date(),
          lastUsed: new Date(),
          triggerCategory: patternDef.triggerCategory,
          emotionalWeight: patternDef.emotionalWeight,
        });
      }

      if (!detectedCategories.includes(patternDef.category)) {
        detectedCategories.push(patternDef.category);
      }

      log.debug(
        { category: patternDef.category, phrase: match[0], confidence },
        'Detected phrase pattern'
      );
    }
  }

  // Extract temporal patterns
  for (const indicator of TEMPORAL_INDICATORS) {
    const match = text.match(indicator.pattern);
    if (!match) continue;

    const existingIndex = temporalPatterns.findIndex((p) => p.timeOfDay === indicator.timeOfDay);

    if (existingIndex >= 0) {
      // Update frequency
      temporalPatterns[existingIndex].frequency++;
      const topics = extractTopicsFromText(text);
      temporalPatterns[existingIndex].associatedTopics = [
        ...new Set([...temporalPatterns[existingIndex].associatedTopics, ...topics]),
      ];
    } else {
      // Add new temporal pattern
      temporalPatterns.push({
        timeOfDay: indicator.timeOfDay,
        dayOfWeek: contextTime ? getDayOfWeek(contextTime) : undefined,
        frequency: 1,
        associatedTopics: extractTopicsFromText(text),
        significanceLevel: indicator.significance,
      });
    }

    if (!detectedCategories.includes('temporal')) {
      detectedCategories.push('temporal');
    }

    log.debug(
      { timeOfDay: indicator.timeOfDay, significance: indicator.significance },
      'Detected temporal pattern'
    );
  }

  // Detect conversation hour from context time
  if (contextTime) {
    const hour = contextTime.getHours();
    let timeOfDay: TemporalPattern['timeOfDay'] | null = null;

    if (hour >= 0 && hour < 5) {
      timeOfDay = 'late_night';
    } else if (hour >= 5 && hour < 9) {
      timeOfDay = 'early_morning';
    } else if (hour >= 9 && hour < 12) {
      timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17 && hour < 22) {
      timeOfDay = 'evening';
    } else if (hour >= 22) {
      timeOfDay = 'late_night';
    }

    if (timeOfDay) {
      const existingIndex = temporalPatterns.findIndex((p) => p.timeOfDay === timeOfDay);
      if (existingIndex >= 0) {
        temporalPatterns[existingIndex].frequency++;
      } else {
        temporalPatterns.push({
          timeOfDay,
          dayOfWeek: getDayOfWeek(contextTime),
          frequency: 1,
          associatedTopics: extractTopicsFromText(text),
          significanceLevel: timeOfDay === 'late_night' ? 0.7 : 0.3,
        });
      }
    }
  }

  const result: CommunicationPatterns = {
    phrasePatterns,
    temporalPatterns,
    sensitiveTopics: existingPatterns?.sensitiveTopics || [],
  };

  const processingTimeMs = Date.now() - startTime;

  log.info(
    {
      phraseCount: phrasePatterns.length,
      temporalCount: temporalPatterns.length,
      categoriesDetected: detectedCategories.length,
      processingTimeMs,
    },
    'Communication pattern extraction complete'
  );

  return {
    patterns: result,
    detectedCategories,
    processingTimeMs,
  };
}

/**
 * Detect if text contains distress signals
 */
export function hasDistressSignals(text: string): boolean {
  const distressPatterns = PHRASE_PATTERN_DEFS.filter(
    (p) => p.category === 'distress' || p.category === 'hopelessness'
  );

  return distressPatterns.some((patternDef) => patternDef.patterns.some((p) => p.test(text)));
}

/**
 * Detect if text contains deflection signals
 */
export function hasDeflectionSignals(text: string): boolean {
  const deflectionPatterns = PHRASE_PATTERN_DEFS.filter(
    (p) => p.category === 'deflection' || p.category === 'avoidance'
  );

  return deflectionPatterns.some((patternDef) => patternDef.patterns.some((p) => p.test(text)));
}

/**
 * Get the dominant communication pattern category
 */
export function getDominantPattern(
  patterns: CommunicationPatterns
): { category: string; weight: number } | null {
  if (patterns.phrasePatterns.length === 0) {
    return null;
  }

  // Group by trigger category and calculate weighted frequency
  const categoryWeights: Record<string, number> = {};

  for (const pattern of patterns.phrasePatterns) {
    const category = pattern.triggerCategory;
    const weight = pattern.frequency * pattern.emotionalWeight;
    categoryWeights[category] = (categoryWeights[category] || 0) + weight;
  }

  // Find the dominant category
  let dominantCategory = '';
  let maxWeight = 0;

  for (const [category, weight] of Object.entries(categoryWeights)) {
    if (weight > maxWeight) {
      maxWeight = weight;
      dominantCategory = category;
    }
  }

  return dominantCategory ? { category: dominantCategory, weight: maxWeight } : null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculatePhraseConfidence(match: RegExpMatchArray, text: string): number {
  let confidence = 0.6;

  // Increase for first-person statements
  if (/\bI\b/i.test(match[0])) {
    confidence += 0.2;
  }

  // Increase for longer matches (more context)
  if (match[0].length > 20) {
    confidence += 0.1;
  }

  // Increase if phrase is emphasized
  if (/!|\?{2,}|\.{3}/i.test(text)) {
    confidence += 0.1;
  }

  return Math.min(1, confidence);
}

function extractPhraseContext(text: string, matchIndex: number): string {
  const radius = 50;
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(text.length, matchIndex + radius);
  return text.slice(start, end).trim();
}

function extractTopicsFromText(text: string): string[] {
  const topics: string[] = [];

  const topicPatterns: Array<{ pattern: RegExp; topic: string }> = [
    { pattern: /sleep|insomnia|rest|tired/i, topic: 'sleep' },
    { pattern: /work|job|career|boss/i, topic: 'work' },
    { pattern: /family|parent|sibling|kid/i, topic: 'family' },
    { pattern: /relationship|partner|dating/i, topic: 'relationships' },
    { pattern: /money|finance|debt|pay/i, topic: 'finances' },
    { pattern: /health|doctor|sick|pain/i, topic: 'health' },
    { pattern: /stress|anxious|anxiety|worry/i, topic: 'stress' },
    { pattern: /sad|depress|down|blue/i, topic: 'mood' },
    { pattern: /future|plan|goal|dream/i, topic: 'future' },
    { pattern: /past|regret|memory|remember/i, topic: 'past' },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(text)) {
      topics.push(topic);
    }
  }

  return [...new Set(topics)];
}

function getDayOfWeek(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractCommunicationPatterns,
  hasDistressSignals,
  hasDeflectionSignals,
  getDominantPattern,
};
