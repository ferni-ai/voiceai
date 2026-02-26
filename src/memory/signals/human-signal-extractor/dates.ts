/**
 * Human Signal Extractor — date extraction.
 * @module memory/signals/human-signal-extractor/dates
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { ImportantDate } from '../../../types/human-memory.js';
import type { ConversationTurn, ExtractionContext } from './types.js';

const log = getLogger().child({ module: 'HumanSignalExtractor' });

// DATE EXTRACTION
// ============================================================================

/**
 * Patterns for detecting important dates in conversation
 */
const DATE_PATTERNS = [
  // Birthdays - more flexible patterns
  { pattern: /my birthday is (on )?(\w+ \d+|\d+\/\d+)/i, type: 'birthday' as const },
  {
    pattern: /birthday (?:is )?(?:on |coming up (?:on )?)(\w+ \d+|\d+\/\d+)/i,
    type: 'birthday' as const,
  },
  { pattern: /(?:i|we) (?:turn|turned|turning) (\d+) (?:on|in) (\w+)/i, type: 'birthday' as const },
  { pattern: /born (?:on |in )(\w+ \d+|\d+\/\d+)/i, type: 'birthday' as const },
  { pattern: /turning (\d+) (?:on |next |this )(\w+ \d+|\w+)/i, type: 'birthday' as const },

  // Anniversaries
  { pattern: /(?:our|my) anniversary is (on )?(\w+ \d+|\d+\/\d+)/i, type: 'anniversary' as const },
  { pattern: /(?:married|got married) (?:on |in )(\w+ \d+|\d{4})/i, type: 'anniversary' as const },
  { pattern: /(\d+) years? (?:married|together)/i, type: 'anniversary' as const },

  // Loss anniversaries
  // Patterns for "passed away on October 5", "died in 2020", etc.
  {
    // Direct: "passed away on October 5" or "died in 2020"
    pattern: /(?:passed away|died|lost)(?: \w+)? (?:on |in )(\w+ \d+|\d{4})/i,
    type: 'loss_anniversary' as const,
  },
  {
    // With subject: "my mom passed away on October 5" - captures who between passed and date
    pattern: /(?:my |our |the )?\w+ (?:passed away|died) (?:on |in )(\w+ \d+|\d{4})/i,
    type: 'loss_anniversary' as const,
  },
  {
    // Loss with person reference: "I lost my mom on October 5"
    pattern: /(?:i |we )lost (?:my |our )?\w+ (?:on |in )(\w+ \d+|\d{4})/i,
    type: 'loss_anniversary' as const,
  },
  {
    // Time since loss: "it's been 5 years since she passed"
    pattern: /it(?:'s| will be| has been) (\d+) years? since (?:.*?) (?:passed|died|lost)/i,
    type: 'loss_anniversary' as const,
  },

  // Milestones
  { pattern: /(\d+) years? sober/i, type: 'milestone' as const },
  {
    pattern: /quit (?:smoking|drinking) (\d+) (?:years?|months?) ago/i,
    type: 'milestone' as const,
  },
  { pattern: /started (?:.*) (\d+) (?:years?|months?) ago/i, type: 'milestone' as const },
];

/**
 * Extract important dates from conversation
 */
export function extractDates(turns: ConversationTurn[], context: ExtractionContext): ImportantDate[] {
  const dates: ImportantDate[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, type } of DATE_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        // Parse the date - check all capture groups for a valid date
        // Some patterns have optional groups so we try match[2], match[1], etc.
        let dateText: string | undefined;
        for (let i = match.length - 1; i >= 1; i--) {
          if (match[i] && isLikelyDateText(match[i])) {
            dateText = match[i];
            break;
          }
        }
        // Fallback to old behavior if no date-like text found
        if (!dateText) {
          dateText = match[2] || match[1];
        }
        const parsed = parseFlexibleDate(dateText);

        if (parsed) {
          dates.push({
            id: `date_${type}_${Date.now()}`,
            type,
            label: `${context.userName || 'User'}'s ${type.replace('_', ' ')}`,
            month: parsed.month,
            day: parsed.day,
            year: parsed.year,
            significance: type === 'loss_anniversary' ? 'major' : 'meaningful',
            wantsAcknowledgment: type !== 'loss_anniversary', // Default: don't assume for sensitive dates
            sentiment:
              type === 'loss_anniversary'
                ? 'sensitive'
                : type === 'birthday'
                  ? 'celebratory'
                  : 'neutral',
            discoveredAt: now,
          });
        }
      }
    }
  }

  return dates;
}

/**
 * Check if a string looks like date text (month name, year, or date format)
 */
function isLikelyDateText(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();

  // Month names
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];

  // Check for month name (with optional day)
  if (monthNames.some((m) => lower.includes(m))) return true;

  // Check for year (4 digits in reasonable range)
  const yearMatch = text.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 1900 && year <= 2100) return true;
  }

  // Check for MM/DD or similar formats
  if (/\d+\/\d+/.test(text)) return true;

  return false;
}

/**
 * Parse a flexible date string into month/day/year
 */
function parseFlexibleDate(dateText: string): { month: number; day: number; year?: number } | null {
  // Month name + day
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const monthMatch = dateText.toLowerCase().match(/(\w+)\s+(\d+)/);
  if (monthMatch) {
    const monthIdx = monthNames.indexOf(monthMatch[1].toLowerCase());
    if (monthIdx >= 0) {
      return { month: monthIdx + 1, day: parseInt(monthMatch[2], 10) };
    }
  }

  // MM/DD format
  const slashMatch = dateText.match(/(\d+)\/(\d+)/);
  if (slashMatch) {
    return { month: parseInt(slashMatch[1], 10), day: parseInt(slashMatch[2], 10) };
  }

  // Year-only (for loss anniversaries like "in 2019")
  // Use January 1st as placeholder for year-only dates
  const yearOnlyMatch = dateText.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1], 10);
    if (year >= 1900 && year <= 2100) {
      return { month: 1, day: 1, year };
    }
  }

  return null;
}

// ============================================================================
