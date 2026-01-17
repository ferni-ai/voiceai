/**
 * Significant Date Extractor
 *
 * Phase 2: Personal Memory Integration
 *
 * Extracts significant dates from conversation text. These include:
 * - Birthdays (user's or loved ones)
 * - Anniversaries (wedding, dating, work)
 * - Loss dates (death of loved ones)
 * - Milestones (graduations, promotions)
 * - Medical events (diagnoses, surgeries)
 * - Celebrations (recurring positive events)
 *
 * Uses pattern matching for common date expressions and context
 * analysis to determine emotional significance.
 *
 * @module SignificantDateExtractor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { SignificantDate, SignificantDateType } from '../user-trigger-profile.types.js';

const log = createLogger({ module: 'significant-date-extractor' });

// ============================================================================
// EXTRACTION PATTERNS
// ============================================================================

interface DateExtractionPattern {
  pattern: RegExp;
  type: SignificantDateType;
  baseEmotionalWeight: number;
  extractDate?: (match: RegExpMatchArray) => string | null;
  extractPerson?: (match: RegExpMatchArray) => string | null;
}

// Month name to number mapping
const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const ORDINAL_PATTERN = '(?:1st|2nd|3rd|[4-9]th|1[0-9]th|2[0-9]th|3[01]st|\\d{1,2})';
const MONTH_PATTERN = Object.keys(MONTHS).join('|');

/**
 * Pattern definitions for date extraction
 */
const DATE_PATTERNS: DateExtractionPattern[] = [
  // Birthday patterns
  {
    pattern: new RegExp(
      `(?:my|his|her|their)\\s+(?:mom'?s?|mother'?s?|dad'?s?|father'?s?)\\s+birthday\\s+is\\s+(?:on\\s+)?(?:the\\s+)?(${ORDINAL_PATTERN})\\s+(?:of\\s+)?(${MONTH_PATTERN})`,
      'i'
    ),
    type: 'birthday',
    baseEmotionalWeight: 0.7,
    extractDate: (match) => {
      const day = parseInt(match[1].replace(/\D/g, ''), 10);
      const month = MONTHS[match[2].toLowerCase()];
      if (month && day >= 1 && day <= 31) {
        return `YYYY-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
    extractPerson: (match) => {
      if (/mom|mother/i.test(match[0])) return 'Mom';
      if (/dad|father/i.test(match[0])) return 'Dad';
      return null;
    },
  },
  {
    pattern: new RegExp(
      `(?:my|his|her|their)\\s+(\\w+)'?s?\\s+birthday\\s+is\\s+(?:on\\s+)?(?:the\\s+)?(${ORDINAL_PATTERN})\\s+(?:of\\s+)?(${MONTH_PATTERN})`,
      'i'
    ),
    type: 'birthday',
    baseEmotionalWeight: 0.6,
    extractDate: (match) => {
      const day = parseInt(match[2].replace(/\D/g, ''), 10);
      const month = MONTHS[match[3].toLowerCase()];
      if (month && day >= 1 && day <= 31) {
        return `YYYY-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
    extractPerson: (match) => match[1],
  },
  {
    pattern: new RegExp(
      `my\\s+birthday\\s+is\\s+(?:on\\s+)?(?:the\\s+)?(${ORDINAL_PATTERN})\\s+(?:of\\s+)?(${MONTH_PATTERN})`,
      'i'
    ),
    type: 'birthday',
    baseEmotionalWeight: 0.5,
    extractDate: (match) => {
      const day = parseInt(match[1].replace(/\D/g, ''), 10);
      const month = MONTHS[match[2].toLowerCase()];
      if (month && day >= 1 && day <= 31) {
        return `YYYY-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },
  {
    pattern: new RegExp(
      `(${MONTH_PATTERN})\\s+(${ORDINAL_PATTERN})(?:,?\\s+\\d{4})?\\s+is\\s+(?:my|his|her|their)\\s+birthday`,
      'i'
    ),
    type: 'birthday',
    baseEmotionalWeight: 0.5,
    extractDate: (match) => {
      const month = MONTHS[match[1].toLowerCase()];
      const day = parseInt(match[2].replace(/\D/g, ''), 10);
      if (month && day >= 1 && day <= 31) {
        return `YYYY-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },

  // Anniversary patterns
  {
    pattern: new RegExp(
      `(?:our|my)\\s+(?:wedding\\s+)?anniversary\\s+is\\s+(?:on\\s+)?(?:the\\s+)?(${ORDINAL_PATTERN})\\s+(?:of\\s+)?(${MONTH_PATTERN})`,
      'i'
    ),
    type: 'anniversary',
    baseEmotionalWeight: 0.8,
    extractDate: (match) => {
      const day = parseInt(match[1].replace(/\D/g, ''), 10);
      const month = MONTHS[match[2].toLowerCase()];
      if (month && day >= 1 && day <= 31) {
        return `YYYY-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },
  {
    pattern:
      /we\s+got\s+married\s+on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)(?:,?\s+(\d{4}))?/i,
    type: 'anniversary',
    baseEmotionalWeight: 0.8,
    extractDate: (match) => {
      const day = parseInt(match[1], 10);
      const month = MONTHS[match[2].toLowerCase()];
      const year = match[3] || 'YYYY';
      if (month && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },

  // Loss/death patterns
  {
    pattern:
      /(?:my|his|her|their)\s+(\w+)\s+(?:passed\s+away|died)\s+(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)(?:,?\s+(\d{4}))?/i,
    type: 'loss',
    baseEmotionalWeight: 0.95,
    extractDate: (match) => {
      const day = parseInt(match[2], 10);
      const month = MONTHS[match[3].toLowerCase()];
      const year = match[4] || 'YYYY';
      if (month && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
    extractPerson: (match) => match[1],
  },
  {
    pattern:
      /lost\s+(?:my|his|her|their)\s+(\w+)(?:\s+to\s+\w+)?\s+(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)(?:,?\s+(\d{4}))?/i,
    type: 'loss',
    baseEmotionalWeight: 0.95,
    extractDate: (match) => {
      const day = parseInt(match[2], 10);
      const month = MONTHS[match[3].toLowerCase()];
      const year = match[4] || 'YYYY';
      if (month && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
    extractPerson: (match) => match[1],
  },
  {
    pattern: /anniversary\s+of\s+(?:my|his|her|their)\s+(\w+)'?s?\s+(?:passing|death)/i,
    type: 'loss',
    baseEmotionalWeight: 0.95,
    extractPerson: (match) => match[1],
  },

  // Milestone patterns
  {
    pattern:
      /graduated\s+(?:from\s+\w+\s+)?(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)(?:,?\s+(\d{4}))?/i,
    type: 'milestone',
    baseEmotionalWeight: 0.6,
    extractDate: (match) => {
      const day = parseInt(match[1], 10);
      const month = MONTHS[match[2].toLowerCase()];
      const year = match[3] || 'YYYY';
      if (month && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },
  {
    pattern:
      /got\s+(?:the\s+)?(?:promotion|job|offer)\s+(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)(?:,?\s+(\d{4}))?/i,
    type: 'milestone',
    baseEmotionalWeight: 0.5,
    extractDate: (match) => {
      const day = parseInt(match[1], 10);
      const month = MONTHS[match[2].toLowerCase()];
      const year = match[3] || 'YYYY';
      if (month && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },

  // Medical patterns
  {
    pattern:
      /(?:diagnosed|surgery|operation)\s+(?:was\s+)?(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)(?:,?\s+(\d{4}))?/i,
    type: 'medical',
    baseEmotionalWeight: 0.8,
    extractDate: (match) => {
      const day = parseInt(match[1], 10);
      const month = MONTHS[match[2].toLowerCase()];
      const year = match[3] || 'YYYY';
      if (month && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },

  // Sobriety/recovery dates
  {
    pattern:
      /(?:sober|clean)\s+since\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)(?:,?\s+(\d{4}))?/i,
    type: 'milestone',
    baseEmotionalWeight: 0.85,
    extractDate: (match) => {
      const day = parseInt(match[1], 10);
      const month = MONTHS[match[2].toLowerCase()];
      const year = match[3] || 'YYYY';
      if (month && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },
];

// ============================================================================
// EMOTIONAL WEIGHT MODIFIERS
// ============================================================================

interface EmotionalModifier {
  pattern: RegExp;
  modifier: number;
}

const EMOTIONAL_MODIFIERS: EmotionalModifier[] = [
  // Increase weight for strong emotional language
  { pattern: /devastating|heartbreaking|worst\s+day|changed\s+my\s+life/i, modifier: 0.15 },
  { pattern: /best\s+day|happiest|most\s+important|means\s+everything/i, modifier: 0.1 },
  { pattern: /still\s+hurts|never\s+forget|hard\s+to\s+talk\s+about/i, modifier: 0.1 },

  // Decrease weight for casual mentions
  { pattern: /I\s+think|maybe|not\s+sure|approximately/i, modifier: -0.1 },
  { pattern: /just\s+a\s+regular|not\s+a\s+big\s+deal/i, modifier: -0.15 },
];

// ============================================================================
// TRIGGER CATEGORY MAPPING
// ============================================================================

const TYPE_TO_TRIGGER_CATEGORIES: Record<SignificantDateType, string[]> = {
  birthday: ['temporal', 'relational', 'celebration'],
  anniversary: ['temporal', 'relational', 'emotional'],
  loss: ['temporal', 'grief', 'emotional'],
  milestone: ['temporal', 'growth', 'celebration'],
  medical: ['temporal', 'emotional', 'domain'],
  trauma: ['temporal', 'emotional', 'behavioral'],
  celebration: ['temporal', 'emotional', 'celebration'],
  custom: ['temporal'],
};

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

export interface DateExtractionOptions {
  /** Minimum confidence to include in results (0-1) */
  minConfidence?: number;
  /** Source of the extraction */
  source?: 'explicit' | 'inferred';
  /** Conversation ID for tracking */
  conversationId?: string;
}

export interface DateExtractionResult {
  dates: SignificantDate[];
  processingTimeMs: number;
}

/**
 * Extract significant dates from conversation text
 */
export function extractSignificantDates(
  text: string,
  options: DateExtractionOptions = {}
): DateExtractionResult {
  const startTime = Date.now();
  const { minConfidence = 0.5, source = 'inferred' } = options;

  const extractedDates: SignificantDate[] = [];
  const seenDates = new Set<string>(); // Avoid duplicates

  for (const patternDef of DATE_PATTERNS) {
    const match = text.match(patternDef.pattern);
    if (!match) continue;

    const dateStr = patternDef.extractDate?.(match);
    if (!dateStr && !patternDef.extractPerson) continue;

    // Create unique key to avoid duplicates (normalize to lowercase for comparison)
    const person = patternDef.extractPerson?.(match);
    const normalizedPerson = person?.toLowerCase() || 'self';
    const uniqueKey = `${patternDef.type}:${dateStr || 'unknown'}:${normalizedPerson}`;
    if (seenDates.has(uniqueKey)) continue;
    seenDates.add(uniqueKey);

    // Calculate emotional weight with modifiers
    let emotionalWeight = patternDef.baseEmotionalWeight;
    for (const modifier of EMOTIONAL_MODIFIERS) {
      if (modifier.pattern.test(text)) {
        emotionalWeight = Math.max(0, Math.min(1, emotionalWeight + modifier.modifier));
      }
    }

    // Calculate confidence
    const confidence = calculateConfidence(match, patternDef, text);
    if (confidence < minConfidence) continue;

    // Build description
    const description = buildDescription(match, patternDef.type, person);

    const significantDate: SignificantDate = {
      id: `date_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: dateStr || `YYYY-01-01`, // Placeholder if date couldn't be extracted
      isRecurring: patternDef.type === 'birthday' || patternDef.type === 'anniversary',
      type: patternDef.type,
      description,
      relatedPerson: person ?? undefined,
      emotionalWeight,
      triggerCategories: TYPE_TO_TRIGGER_CATEGORIES[patternDef.type] || ['temporal'],
      extractedAt: new Date(),
      confidence,
      source,
    };

    extractedDates.push(significantDate);
    log.debug({ type: patternDef.type, date: dateStr, person }, 'Extracted significant date');
  }

  const processingTimeMs = Date.now() - startTime;

  log.info(
    { datesFound: extractedDates.length, processingTimeMs },
    'Significant date extraction complete'
  );

  return { dates: extractedDates, processingTimeMs };
}

/**
 * Calculate confidence score for an extraction
 */
function calculateConfidence(
  match: RegExpMatchArray,
  patternDef: DateExtractionPattern,
  text: string
): number {
  let confidence = 0.7; // Base confidence

  // Increase for explicit date mentions
  if (patternDef.extractDate?.(match)) {
    confidence += 0.15;
  }

  // Increase for person mentioned
  if (patternDef.extractPerson?.(match)) {
    confidence += 0.05;
  }

  // Increase for longer match (more context)
  if (match[0].length > 30) {
    confidence += 0.05;
  }

  // Increase for first-person statements
  if (/\b(my|our|I)\b/i.test(text)) {
    confidence += 0.05;
  }

  return Math.min(1, confidence);
}

/**
 * Build a human-readable description
 */
function buildDescription(
  match: RegExpMatchArray,
  type: SignificantDateType,
  person?: string | null
): string {
  switch (type) {
    case 'birthday':
      return person ? `${person}'s birthday` : 'Birthday';
    case 'anniversary':
      return 'Wedding anniversary';
    case 'loss':
      return person ? `Anniversary of ${person}'s passing` : 'Memorial date';
    case 'milestone':
      if (/graduat/i.test(match[0])) return 'Graduation';
      if (/promot/i.test(match[0])) return 'Promotion anniversary';
      if (/sober|clean/i.test(match[0])) return 'Sobriety anniversary';
      return 'Personal milestone';
    case 'medical':
      if (/diagnos/i.test(match[0])) return 'Diagnosis date';
      if (/surgery|operation/i.test(match[0])) return 'Surgery date';
      return 'Medical event';
    case 'trauma':
      return 'Significant event';
    case 'celebration':
      return 'Celebration';
    default:
      return 'Significant date';
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if text contains any date-related mentions worth extracting
 */
export function hasDateMentions(text: string): boolean {
  const quickPatterns = [
    /birthday/i,
    /anniversary/i,
    /passed\s+away|died|lost\s+(?:my|his|her)/i,
    /graduated|promotion/i,
    /diagnosed|surgery/i,
    /sober\s+since/i,
  ];

  return quickPatterns.some((p) => p.test(text));
}

/**
 * Extract a year from text if present
 */
export function extractYear(text: string): number | null {
  const match = text.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractSignificantDates,
  hasDateMentions,
  extractYear,
};
