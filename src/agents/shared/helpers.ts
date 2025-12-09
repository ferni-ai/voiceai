/**
 * Voice Agent Helpers
 *
 * Small utility functions used by the voice agent.
 */

/**
 * Check if text already has SSML tags
 */
export function hasSsmlTags(text: string): boolean {
  return /<\/?[a-z]+[^>]*>/i.test(text);
}

/**
 * Sanitize user name for safe use
 */
export function sanitizeUserName(name: string): string {
  // Remove any HTML/script tags
  return name.replace(/<[^>]*>/g, '').trim();
}
