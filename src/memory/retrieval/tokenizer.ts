/**
 * Text Tokenizer for BM25 Search
 *
 * Tokenizes text for keyword-based search, handling:
 * - Stemming (basic)
 * - Stop word removal
 * - Normalization
 * - N-gram generation
 *
 * @module memory/retrieval/tokenizer
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'Tokenizer' });

// ============================================================================
// STOP WORDS
// ============================================================================

/**
 * Common English stop words to filter out
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'this',
  'but',
  'they',
  'have',
  'had',
  'what',
  'when',
  'where',
  'who',
  'which',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'can',
  'should',
  'now',
  'i',
  'me',
  'my',
  'myself',
  'we',
  'our',
  'ours',
  'ourselves',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
  'him',
  'his',
  'himself',
  'she',
  'her',
  'hers',
  'herself',
  'them',
  'their',
  'theirs',
  'themselves',
  'about',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'any',
  'doing',
  'would',
  'could',
  'been',
  'being',
  'does',
  'did',
  'having',
  'am',
  "i'm",
  "you're",
  "he's",
  "she's",
  "it's",
  "we're",
  "they're",
  "i've",
  "you've",
  "we've",
  "they've",
  "i'd",
  "you'd",
  "he'd",
  "she'd",
  "we'd",
  "they'd",
  "i'll",
  "you'll",
  "he'll",
  "she'll",
  "we'll",
  "they'll",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "hasn't",
  "haven't",
  "hadn't",
  "doesn't",
  "don't",
  "didn't",
  "won't",
  "wouldn't",
  "shan't",
  "shouldn't",
  "can't",
  'cannot',
  "couldn't",
  "mustn't",
  "let's",
  "that's",
  "who's",
  "what's",
  "here's",
  "there's",
  "when's",
  "where's",
  "why's",
  "how's",
]);

// ============================================================================
// STEMMING
// ============================================================================

/**
 * Simple suffix-stripping stemmer
 * Based on Porter stemmer principles but simplified for performance
 */
function stem(word: string): string {
  // Skip short words
  if (word.length <= 3) return word;

  let stemmed = word;

  // Common suffixes to strip (ordered by length, longest first)
  const suffixes = [
    // -ing with doubling
    { suffix: 'ying', replacement: 'y' },
    { suffix: 'ing', replacement: '', minLength: 5 },
    // -ed with doubling
    { suffix: 'ied', replacement: 'y' },
    { suffix: 'ed', replacement: '', minLength: 4 },
    // -ly
    { suffix: 'ily', replacement: 'y' },
    { suffix: 'ly', replacement: '', minLength: 4 },
    // -ness
    { suffix: 'iness', replacement: 'y' },
    { suffix: 'ness', replacement: '' },
    // -ment
    { suffix: 'ment', replacement: '' },
    // -ful
    { suffix: 'ful', replacement: '' },
    // -less
    { suffix: 'less', replacement: '' },
    // -ation
    { suffix: 'ation', replacement: '' },
    // -tion
    { suffix: 'tion', replacement: '' },
    // -er/-or
    { suffix: 'ier', replacement: 'y' },
    { suffix: 'er', replacement: '', minLength: 4 },
    { suffix: 'or', replacement: '', minLength: 4 },
    // -est
    { suffix: 'iest', replacement: 'y' },
    { suffix: 'est', replacement: '', minLength: 4 },
    // -es
    { suffix: 'ies', replacement: 'y' },
    { suffix: 'es', replacement: '', minLength: 4 },
    // -s (plural)
    { suffix: 's', replacement: '', minLength: 4 },
  ];

  for (const { suffix, replacement, minLength = 3 } of suffixes) {
    if (stemmed.endsWith(suffix) && stemmed.length >= minLength) {
      stemmed = stemmed.slice(0, -suffix.length) + replacement;
      break; // Only apply one suffix rule
    }
  }

  return stemmed;
}

// ============================================================================
// TOKENIZATION
// ============================================================================

/**
 * Tokenization options
 */
export interface TokenizeOptions {
  /** Convert to lowercase (default: true) */
  lowercase?: boolean;
  /** Remove stop words (default: true) */
  removeStopWords?: boolean;
  /** Apply stemming (default: true) */
  applyStemming?: boolean;
  /** Minimum token length (default: 2) */
  minLength?: number;
  /** Generate bigrams (default: false) */
  includeBigrams?: boolean;
  /** Keep original unstemmed tokens (default: false) */
  keepOriginal?: boolean;
}

/**
 * Tokenize text for BM25 search
 *
 * @param text - Input text to tokenize
 * @param options - Tokenization options
 * @returns Array of tokens
 */
export function tokenize(text: string, options: TokenizeOptions = {}): string[] {
  const {
    lowercase = true,
    removeStopWords = true,
    applyStemming = true,
    minLength = 2,
    includeBigrams = false,
    keepOriginal = false,
  } = options;

  // 1. Normalize text
  let normalized = text;
  if (lowercase) {
    normalized = normalized.toLowerCase();
  }

  // 2. Remove punctuation and special characters, keep apostrophes for contractions
  normalized = normalized
    .replace(/[^\w\s']/g, ' ') // Replace non-word chars with space
    .replace(/[']+/g, '') // Remove apostrophes
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();

  // 3. Split into tokens
  const rawTokens = normalized.split(' ').filter((t) => t.length > 0);

  // 4. Filter and process tokens
  const tokens: string[] = [];
  const originalTokens: string[] = [];

  for (const token of rawTokens) {
    // Skip short tokens
    if (token.length < minLength) continue;

    // Skip stop words
    if (removeStopWords && STOP_WORDS.has(token)) continue;

    // Keep original if requested
    if (keepOriginal) {
      originalTokens.push(token);
    }

    // Apply stemming
    const finalToken = applyStemming ? stem(token) : token;

    // Skip if stemming made it too short
    if (finalToken.length >= minLength) {
      tokens.push(finalToken);
    }
  }

  // 5. Generate bigrams if requested
  const bigrams: string[] = [];
  if (includeBigrams && tokens.length >= 2) {
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
    }
  }

  // 6. Combine results
  const result = [...tokens, ...bigrams];

  // Add originals if requested (for boosting exact matches)
  if (keepOriginal) {
    for (const orig of originalTokens) {
      if (!result.includes(orig)) {
        result.push(orig);
      }
    }
  }

  return result;
}

/**
 * Tokenize for indexing (stores searchable tokens)
 * Uses more aggressive options for broader matching
 */
export function tokenizeForIndex(text: string): string[] {
  return tokenize(text, {
    lowercase: true,
    removeStopWords: true,
    applyStemming: true,
    minLength: 2,
    includeBigrams: true,
    keepOriginal: true,
  });
}

/**
 * Tokenize for query (matches what's in the index)
 */
export function tokenizeForQuery(text: string): string[] {
  return tokenize(text, {
    lowercase: true,
    removeStopWords: true,
    applyStemming: true,
    minLength: 2,
    includeBigrams: false, // Don't generate bigrams for queries
    keepOriginal: true, // Keep original for exact matching
  });
}

/**
 * Calculate term frequency for a document
 */
export function calculateTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

/**
 * Extract name tokens (for person entity matching)
 * Special handling for names to improve entity resolution
 */
export function tokenizeName(name: string): string[] {
  const tokens: string[] = [];

  // Normalize
  const normalized = name.toLowerCase().trim();
  tokens.push(normalized);

  // Split into parts
  const parts = normalized.split(/\s+/);
  tokens.push(...parts);

  // Add first name only (common reference)
  if (parts.length > 1) {
    tokens.push(parts[0]);
  }

  // Add initials
  if (parts.length >= 2) {
    const initials = parts.map((p) => p[0]).join('');
    if (initials.length >= 2) {
      tokens.push(initials);
    }
  }

  // Add common nicknames for common names
  const nicknameMap: Record<string, string[]> = {
    michael: ['mike', 'mikey'],
    william: ['will', 'bill', 'billy'],
    robert: ['rob', 'bob', 'bobby'],
    richard: ['rick', 'dick'],
    elizabeth: ['liz', 'beth', 'lizzy'],
    jennifer: ['jen', 'jenny'],
    katherine: ['kate', 'kathy', 'katie'],
    christopher: ['chris'],
    matthew: ['matt'],
    alexander: ['alex'],
    benjamin: ['ben'],
    daniel: ['dan', 'danny'],
    joseph: ['joe', 'joey'],
    nicholas: ['nick', 'nicky'],
    anthony: ['tony'],
    thomas: ['tom', 'tommy'],
  };

  const firstName = parts[0];
  if (nicknameMap[firstName]) {
    tokens.push(...nicknameMap[firstName]);
  }

  return Array.from(new Set(tokens));
}

// ============================================================================
// EXPORTS
// ============================================================================

export { stem, STOP_WORDS };
