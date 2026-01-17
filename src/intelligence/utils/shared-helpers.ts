/**
 * Shared Helper Functions
 *
 * Consolidated utility functions used across multiple intelligence modules.
 * Prevents code duplication and ensures consistent behavior.
 */

// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';

const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

/**
 * Get the time of day category from a Date
 */
export function getTimeOfDay(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

/**
 * Detect the type of response from content
 */
export function detectResponseType(
  content: string
): 'story' | 'advice' | 'question' | 'empathy' | 'humor' | 'explanation' {
  const lower = content.toLowerCase();

  // Story indicators
  if (
    /\b(i remember|when i|back in|years ago|let me tell you|there was a time)\b/.test(lower) &&
    content.length > 150
  ) {
    return 'story';
  }

  // Empathy indicators
  if (/\b(understand|hear you|that must|feel|sorry to hear)\b/.test(lower)) {
    return 'empathy';
  }

  // Advice indicators
  if (/\b(should|recommend|suggest|consider|try|important|make sure)\b/.test(lower)) {
    return 'advice';
  }

  // Question indicators
  if (content.includes('?') && content.length < 100) {
    return 'question';
  }

  // Humor indicators
  if (/\b(haha|joke|kidding|😄|😂|!.*!)\b/.test(lower)) {
    return 'humor';
  }

  return 'explanation';
}

/**
 * Get response length category
 */
export function getResponseLength(content: string): 'brief' | 'moderate' | 'lengthy' {
  // 🦀 Rust-accelerated word counting
  const wordCount = RUST_COUNTING_AVAILABLE ? countWordsRust(content) : content.split(/\s+/).length;
  if (wordCount < 30) return 'brief';
  if (wordCount > 100) return 'lengthy';
  return 'moderate';
}

/**
 * Extract key phrases from content (simplified NLP)
 * Used for emergent pattern detection
 */
export function extractKeyPhrases(content: string, maxPhrases = 5): string[] {
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  return sentences.slice(0, maxPhrases).map((s) => s.trim().slice(0, 100));
}

/**
 * Detect story reaction from user response
 */
export function detectStoryReaction(
  userResponse: string
): 'moved' | 'inspired' | 'connected' | 'curious' | 'indifferent' {
  const lower = userResponse.toLowerCase();

  if (/\b(wow|amazing|incredible|beautiful|touching)\b/.test(lower)) return 'moved';
  if (/\b(inspired|motivat|encourage|excit)\b/.test(lower)) return 'inspired';
  if (/\b(me too|same|i also|i remember when|my|mine)\b/.test(lower)) return 'connected';
  if (/\b(tell me more|what happened|then what|how did)\b/.test(lower) || lower.includes('?'))
    return 'curious';

  return 'indifferent';
}

/**
 * Generate a time-ago string for human-readable display
 */
export function getTimeAgoString(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return 'earlier';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return 'a few days ago';
  if (diffDays < 14) return 'last week';
  if (diffDays < 30) return 'a couple weeks ago';
  return 'last month';
}

/**
 * Calculate a simple hash for deterministic user bucketing (A/B tests)
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export default {
  getTimeOfDay,
  detectResponseType,
  getResponseLength,
  extractKeyPhrases,
  detectStoryReaction,
  getTimeAgoString,
  hashString,
};
