/**
 * Human Signal Extractor — values, dreams, fears extraction.
 * @module memory/signals/human-signal-extractor/values-dreams
 */

import type { CoreValue, Dream, Fear } from '../../../types/human-memory.js';
import type { ConversationTurn } from './types.js';

// VALUE EXTRACTION
// ============================================================================

/**
 * Patterns for detecting core values
 */
const VALUE_PATTERNS = [
  // Family values - more flexible patterns
  { pattern: /family (?:comes?|is) first/i, value: 'family first' },
  { pattern: /family (?:is|means) (?:the most|everything|so) important/i, value: 'family first' },
  {
    pattern: /(?:my |the )?most important thing (?:to me )?is (?:my )?family/i,
    value: 'family first',
  },
  // Handle "Family is the most important thing to me" word order
  { pattern: /family is (?:the )?most important(?: thing)?(?: to me)?/i, value: 'family first' },
  { pattern: /family (?:is|means) everything/i, value: 'family first' },
  // Honesty
  { pattern: /(?:i|we) always (?:try to )?be honest/i, value: 'honesty' },
  { pattern: /(?:i |we )?value honesty/i, value: 'honesty' },
  { pattern: /honesty (?:is |means )(?:important|everything)/i, value: 'honesty' },
  { pattern: /(?:please )?always be (?:straight|honest|direct) with me/i, value: 'honesty' },
  // Hard work
  { pattern: /hard work (?:pays off|is important)/i, value: 'hard work' },
  // Fairness
  { pattern: /(?:i|we) believe in (?:being )?fair/i, value: 'fairness' },
  // Kindness
  { pattern: /kindness (?:matters|is important)/i, value: 'kindness' },
  // Integrity
  { pattern: /(?:my|the) word is (?:my|sacred|important)/i, value: 'integrity' },
  // Generosity
  { pattern: /giving back (?:is important|matters)/i, value: 'generosity' },
  // Independence
  { pattern: /(?:i|we) value (?:my|our) independence/i, value: 'independence' },
  // Education
  { pattern: /education is (?:important|everything)/i, value: 'education' },
  // Health
  { pattern: /(?:i|we) prioritize (?:my|our) health/i, value: 'health' },
  // Creativity
  { pattern: /creativity (?:is|means) (?:important|everything)/i, value: 'creativity' },
];

/**
 * Extract core values from conversation
 */
export function extractValues(turns: ConversationTurn[]): CoreValue[] {
  const values: CoreValue[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, value } of VALUE_PATTERNS) {
      if (pattern.test(turn.content)) {
        values.push({
          id: `value_${value.replace(/\s+/g, '_')}_${Date.now()}`,
          value,
          evidence: [turn.content.slice(0, 200)],
          strength: 'mentioned',
          discoveredAt: now,
        });
      }
    }
  }

  return values;
}

// ============================================================================
// DREAM EXTRACTION
// ============================================================================

/**
 * Patterns for detecting dreams and aspirations
 */
const DREAM_PATTERNS = [
  // General dreams - more flexible patterns including contractions
  { pattern: /(?:i|we) (?:dream|hope|wish) (?:of|to) (.+)/i, category: 'other' as const },
  {
    pattern: /(?:i|we|i've|we've) (?:have )?(?:always )?dreamed (?:of|about) (.+)/i,
    category: 'other' as const,
  },
  {
    pattern: /(?:it's been )?(?:a |my )?(?:secret )?dream (?:of mine )?(?:to |is )(.+)/i,
    category: 'other' as const,
  },
  {
    pattern: /(?:that's been )?(?:a |my )?secret dream (?:since|for) (.+)/i,
    category: 'other' as const,
  },
  { pattern: /someday (?:i|we) (?:want to|hope to) (.+)/i, category: 'other' as const },
  { pattern: /(?:i|we) always wanted to (.+)/i, category: 'other' as const },
  { pattern: /(?:i|we)'ve always wanted to (.+)/i, category: 'other' as const },
  // Career dreams
  { pattern: /my dream (?:job|career) (?:is|would be) (.+)/i, category: 'career' as const },
  { pattern: /(?:i|we) (?:want to|hope to) start (.+)/i, category: 'career' as const },
  // Travel
  {
    pattern: /(?:i|we|i've|we've) (?:always )?(?:want(?:ed)? to|hope(?:d)? to) travel to (.+)/i,
    category: 'travel' as const,
  },
  // Learning
  { pattern: /(?:i|we) (?:want to|hope to) learn (.+)/i, category: 'learning' as const },
  // Creative - ensure capture groups exist
  { pattern: /(?:i|we) (?:want to|hope to) write (.+)/i, category: 'creative' as const },
  {
    pattern: /(?:i|we|i've|we've) (?:always )?dreamed of (writing[^.]*|being a writer)/i,
    category: 'creative' as const,
  },
];

/**
 * Extract dreams from conversation
 */
export function extractDreams(turns: ConversationTurn[]): Dream[] {
  const dreams: Dream[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, category } of DREAM_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match && match[1]) {
        dreams.push({
          id: `dream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          description: match[1].slice(0, 200),
          category,
          sentiment: 'excited',
          status: 'someday',
          firstMentioned: now,
        });
      }
    }
  }

  return dreams;
}

// ============================================================================
// FEAR EXTRACTION
// ============================================================================

/**
 * Patterns for detecting fears and worries
 */
const FEAR_PATTERNS = [
  // Core fear patterns - more flexible (support fancy apostrophes too)
  { pattern: /(?:i[''`]m |i am )?(?:afraid|scared) (?:of|that) (.+)/i },
  { pattern: /(?:i|we) (?:worry|worries) about (.+)/i },
  { pattern: /my (?:biggest|greatest) fear is (.+)/i },
  { pattern: /(?:what if|i[''`]m worried) (.+)/i },
  { pattern: /(?:i|we) can[''`]t stop thinking about (.+)/i },
  { pattern: /(?:i|we) (?:dread|hate) (.+)/i },
  // "I'm scared I'll never do it" pattern - capture "I'll never do it" or "never do it"
  { pattern: /scared (?:that )?(?:i[''`]ll |i will )?((?:never |won[''`]t ).+)/i },
  { pattern: /(?:i[''`]m |i am )?nervous about (.+)/i },
  { pattern: /(?:i[''`]m |i am )?terrified (?:of|that) (.+)/i },
];

/**
 * Extract fears from conversation
 */
export function extractFears(turns: ConversationTurn[]): Fear[] {
  const fears: Fear[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern } of FEAR_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match && match[1]) {
        fears.push({
          id: `fear_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          fear: match[1].slice(0, 200),
          frequency: 'occasional',
          discoveredAt: now,
          sensitivity: 'tread_carefully',
        });
      }
    }
  }

  return fears;
}

// ============================================================================
