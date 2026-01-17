/**
 * Story Detection Module
 *
 * Detects when personas tell stories and extracts themes.
 * Tracks story usage to avoid repetition.
 *
 * @module user-learning-engine/story-detection
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/** Story record */
export interface StoryRecord {
  storyId: string;
  theme: string;
  sharedAt: Date;
}

/** Story pattern for detection */
interface StoryPattern {
  pattern: RegExp;
  id: (match: RegExpMatchArray) => string;
}

/**
 * Story patterns for detection
 */
const STORY_PATTERNS: StoryPattern[] = [
  {
    pattern: /\bi remember\b.*\b(1974|1975|1987|2000|2008|2020)/i,
    id: (m: RegExpMatchArray) => `year_story_${m[1]}`,
  },
  {
    pattern: /\bback in\b.*\b(19\d{2}|20\d{2})/i,
    id: (m: RegExpMatchArray) => `year_story_${m[1]}`,
  },
  { pattern: /\bwhen i (started|founded|created) vanguard/i, id: () => 'vanguard_founding' },
  { pattern: /\bmy father (taught|told|showed) me/i, id: () => 'father_lesson' },
  { pattern: /\bi met (warren|buffett)/i, id: () => 'buffett_meeting' },
  { pattern: /\b(samuelson|paul samuelson)/i, id: () => 'samuelson_story' },
  { pattern: /\bwellington fund/i, id: () => 'wellington_story' },
  { pattern: /\bprincetonl/i, id: () => 'princeton_story' },
  { pattern: /\bindex fund.*folly/i, id: () => 'bogles_folly' },
  {
    pattern: /\bthe market (crashed|dropped|fell).*\d{2,4}/i,
    id: () => `market_crash_story`,
  },
];

/**
 * Generic story indicator pattern
 */
const GENERIC_STORY_PATTERN =
  /\b(i remember|back in|years ago|one time|let me tell you|when i was|my (father|mother|wife)|at vanguard)\b/i;

/**
 * Theme patterns
 */
const THEME_PATTERNS: Array<{ pattern: RegExp; theme: string }> = [
  { pattern: /\b(market|crash|recession|panic)/i, theme: 'market_volatility' },
  { pattern: /\b(index fund|passive|low cost)/i, theme: 'index_investing' },
  { pattern: /\b(patience|long.?term|compound)/i, theme: 'patience' },
  { pattern: /\b(family|father|mother|children)/i, theme: 'family' },
  { pattern: /\b(vanguard|wellington)/i, theme: 'career' },
  { pattern: /\b(mistake|wrong|failed|learned)/i, theme: 'lessons' },
];

/**
 * Detect if a message contains a story
 * Returns the story ID if detected, null otherwise
 */
export function detectStoryTelling(message: string): string | null {
  const messageLower = message.toLowerCase();

  // Check specific story patterns first
  for (const { pattern, id } of STORY_PATTERNS) {
    const match = messageLower.match(pattern);
    if (match) {
      return typeof id === 'function' ? id(match) : id;
    }
  }

  // Generic story detection
  const hasStoryIndicator = GENERIC_STORY_PATTERN.test(messageLower);
  const isLongEnough = message.length > 200;

  if (hasStoryIndicator && isLongEnough) {
    // Generate a hash-based ID for unrecognized stories
    return `story_${message.substring(0, 50).replace(/\W+/g, '_').toLowerCase()}`;
  }

  return null;
}

/**
 * Extract the theme of a story
 */
export function extractStoryTheme(message: string): string {
  for (const { pattern, theme } of THEME_PATTERNS) {
    if (pattern.test(message)) return theme;
  }

  return 'general';
}

/**
 * Track a told story
 */
export function trackStoryTold(
  stories: StoryRecord[],
  message: string
): { storyId: string; theme: string; sharedAt: Date } | null {
  const storyId = detectStoryTelling(message);

  if (storyId) {
    const record = {
      storyId,
      theme: extractStoryTheme(message),
      sharedAt: new Date(),
    };
    stories.push(record);
    log.debug({ storyId }, 'Story told tracked');
    return record;
  }

  return null;
}
