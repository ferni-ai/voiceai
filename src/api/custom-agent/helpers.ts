/**
 * Custom Agent API Helpers
 *
 * Utility functions for custom agent routes.
 */

import type { ServerResponse } from 'http';
import { sendJSON } from '../helpers.js';

/**
 * Alias for sendJSON with status-first signature for backward compat
 */
export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

/**
 * Common stop words for keyword extraction
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'dare',
  'ought',
  'used',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'up',
  'down',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
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
  'he',
  'him',
  'his',
  'himself',
  'she',
  'her',
  'hers',
  'herself',
  'it',
  'its',
  'itself',
  'they',
  'them',
  'their',
  'theirs',
  'themselves',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'am',
]);

/**
 * Extracts meaningful keywords from content text
 */
export function extractKeywords(content: string): string[] {
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  // Use Array.from for compatibility
  return Array.from(new Set(words)).slice(0, 10);
}

/**
 * Returns human-readable feedback based on voice quality score
 */
export function getQualityFeedback(quality: string): string {
  switch (quality) {
    case 'excellent':
      return 'Great audio quality! Your voice clone will sound natural.';
    case 'good':
      return 'Good audio quality. Consider adding more samples for better accuracy.';
    case 'fair':
    case 'needs_more':
      return 'Need more audio. Please record at least 10 seconds of clear speech.';
    case 'poor':
      return 'Audio quality is low. Try recording in a quieter environment.';
    default:
      return 'Audio uploaded successfully.';
  }
}

/**
 * Extracts path segments from a URL path
 * e.g., '/api/custom-agents/agent123/voice' -> ['agent123', 'voice']
 */
export function getPathSegments(pathname: string): string[] {
  return pathname.replace('/api/custom-agents', '').split('/').filter(Boolean);
}
