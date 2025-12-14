/**
 * Optimized Pronunciation Processor
 *
 * Performance-optimized pronunciation matching using:
 * - Category-based grouping for quick skipping
 * - Character presence checks before pattern matching
 * - Pre-compiled regex patterns (patterns are already compiled in constants)
 *
 * With 233 patterns, naive iteration is O(n*m) per call.
 * This optimization reduces average-case complexity by skipping
 * entire categories when their required characters aren't present.
 *
 * @module ssml/pronunciation-processor
 */

import { FINANCIAL_END, FINANCIAL_PRONUNCIATIONS, FINANCIAL_START } from './constants.js';
import type { PronunciationEntry } from './types.js';

// =============================================================================
// PATTERN CATEGORIES
// =============================================================================

/**
 * Pattern categories based on what characters they require to match.
 * If a text doesn't contain the required characters, the entire category is skipped.
 */
export interface PatternCategory {
  /** Category name for debugging */
  name: string;
  /** Quick check function - if false, skip all patterns in category */
  quickCheck: (text: string) => boolean;
  /** Patterns in this category */
  patterns: PronunciationEntry[];
}

// =============================================================================
// LAZY INITIALIZATION
// =============================================================================

let categorizedPatterns: PatternCategory[] | null = null;

/**
 * Categorize patterns by their requirements.
 * Called once on first use, then cached.
 */
function categorizePatterns(): PatternCategory[] {
  const categories: PatternCategory[] = [
    {
      name: 'retirement_accounts',
      // Requires digits (401k, 403b, 529, etc.)
      quickCheck: (text) => /\d/.test(text),
      patterns: [],
    },
    {
      name: 'uppercase_acronyms',
      // Requires 2+ uppercase letters in a row
      quickCheck: (text) => /[A-Z]{2,}/.test(text),
      patterns: [],
    },
    {
      name: 'mixed_case_terms',
      // Requires at least one uppercase letter
      quickCheck: (text) => /[A-Z]/.test(text),
      patterns: [],
    },
    {
      name: 'lowercase_terms',
      // Always check - these can match anywhere
      quickCheck: () => true,
      patterns: [],
    },
    {
      name: 'symbols',
      // Requires specific symbols
      quickCheck: (text) => /[&%$@#\/]/.test(text),
      patterns: [],
    },
    {
      name: 'japanese_cultural',
      // Requires specific word stems
      quickCheck: (text) =>
        /wabi|ikigai|kaizen|shinrin|kintsugi|ganbatte|shoganai|mono no aware|omoiyari|natsukashii|gaman|mottainai|yugen|ichi.?go|satori|sensei|sake|umami|tsunami|bonsai|tatami|dojo|futon|ramen|matcha|shoyu|miso|wasabi|edamame|kombucha|tofu/i.test(
          text
        ),
      patterns: [],
    },
  ];

  // Categorize each pattern
  for (const entry of FINANCIAL_PRONUNCIATIONS) {
    const patternStr = entry.pattern.source;

    // Check pattern characteristics
    const hasDigits = /\\d|\[0-9\]|[0-9]/.test(patternStr);
    const hasUppercaseReq =
      /\[A-Z\]|[A-Z]{2,}/.test(patternStr) || /\\b[A-Z]{2,}\\b/.test(patternStr);
    const hasSymbols = /[&%$@#\/]/.test(patternStr);
    const isJapanese = /wabi|ikigai|kaizen|shinrin|kintsugi/i.test(patternStr);

    // Assign to appropriate category
    if (isJapanese) {
      categories.find((c) => c.name === 'japanese_cultural')!.patterns.push(entry);
    } else if (hasDigits) {
      categories.find((c) => c.name === 'retirement_accounts')!.patterns.push(entry);
    } else if (hasSymbols) {
      categories.find((c) => c.name === 'symbols')!.patterns.push(entry);
    } else if (hasUppercaseReq) {
      categories.find((c) => c.name === 'uppercase_acronyms')!.patterns.push(entry);
    } else if (/[A-Z]/.test(patternStr)) {
      categories.find((c) => c.name === 'mixed_case_terms')!.patterns.push(entry);
    } else {
      categories.find((c) => c.name === 'lowercase_terms')!.patterns.push(entry);
    }
  }

  return categories;
}

/**
 * Get categorized patterns (lazy initialization)
 */
function getCategorizedPatterns(): PatternCategory[] {
  if (!categorizedPatterns) {
    categorizedPatterns = categorizePatterns();
  }
  return categorizedPatterns;
}

// =============================================================================
// OPTIMIZED PRONUNCIATION APPLICATION
// =============================================================================

/**
 * Apply pronunciation dictionary to text (optimized)
 *
 * This is the performance-optimized version that:
 * 1. Groups patterns by category
 * 2. Skips entire categories when their required characters aren't present
 * 3. Reduces average-case complexity significantly for typical text
 *
 * @param text - Text to process
 * @returns Text with pronunciations applied and wrapped in protection markers
 */
export function applyPronunciationsOptimized(text: string): string {
  // Quick exit for empty/short text
  if (!text || text.length < 2) {
    return text;
  }

  let result = text;
  const categories = getCategorizedPatterns();

  for (const category of categories) {
    // Quick check - if this category can't match, skip all its patterns
    if (!category.quickCheck(text)) {
      continue;
    }

    // Apply patterns in this category
    for (const entry of category.patterns) {
      // Reset lastIndex for global regex
      entry.pattern.lastIndex = 0;
      result = result.replace(entry.pattern, () => {
        return `${FINANCIAL_START}${entry.replacement}${FINANCIAL_END}`;
      });
    }
  }

  return result;
}

// =============================================================================
// STATS & DEBUGGING
// =============================================================================

/**
 * Get statistics about pattern categorization
 * Useful for debugging and optimization tuning
 */
export function getCategoryStats(): { name: string; count: number }[] {
  const categories = getCategorizedPatterns();
  return categories.map((c) => ({ name: c.name, count: c.patterns.length }));
}

/**
 * Estimate how many patterns will be checked for given text
 */
export function estimatePatternChecks(text: string): {
  total: number;
  checked: number;
  skipped: number;
  categories: { name: string; checked: boolean; count: number }[];
} {
  const categories = getCategorizedPatterns();
  let checked = 0;
  let skipped = 0;
  const categoryStats: { name: string; checked: boolean; count: number }[] = [];

  for (const category of categories) {
    const willCheck = category.quickCheck(text);
    categoryStats.push({
      name: category.name,
      checked: willCheck,
      count: category.patterns.length,
    });
    if (willCheck) {
      checked += category.patterns.length;
    } else {
      skipped += category.patterns.length;
    }
  }

  return {
    total: FINANCIAL_PRONUNCIATIONS.length,
    checked,
    skipped,
    categories: categoryStats,
  };
}

/**
 * Reset categorization cache (for testing)
 */
export function resetPronunciationCache(): void {
  categorizedPatterns = null;
}
