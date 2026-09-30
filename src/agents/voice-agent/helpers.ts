/**
 * Voice Agent Pure Helpers
 *
 * Dependency-free helpers for job metadata, user names and SSML detection.
 * Kept out of index.ts so callers (and tests) can use them without loading
 * the whole handler graph that the barrel re-exports.
 */

/**
 * Check if text contains SSML tags
 */
export function hasSsmlTags(text: string): boolean {
  // Check for any Cartesia SSML tags
  return (
    /<(speed|volume|emotion|break|spell)\b/.test(text) ||
    /<\/(speed|volume|emotion|spell)>/.test(text)
  );
}

/**
 * Filter out placeholder/generated usernames
 */
export function isRealUserName(name: string | undefined): boolean {
  if (!name) return false;
  // Filter out generated placeholders like "user_1234567890", "User 1", or just "User"
  if (/^user[_-]?\d*$/i.test(name)) return false;
  // Filter out UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return false;
  // Filter out numeric-only strings
  if (/^\d+$/.test(name)) return false;
  return true;
}

/**
 * Parse persona from job metadata
 */
export function parsePersonaFromMetadata(metadata: string | undefined): string | null {
  if (!metadata) return null;

  try {
    const parsed = JSON.parse(metadata);
    return parsed.persona_id || parsed.personaId || null;
  } catch {
    return null;
  }
}

/**
 * Parse user info from job metadata
 */
export function parseUserFromMetadata(metadata: string | undefined): {
  userId?: string;
  userName?: string;
} {
  if (!metadata) return {};

  try {
    const parsed = JSON.parse(metadata);
    return {
      userId: parsed.user_id || parsed.userId,
      userName: parsed.user_name || parsed.userName,
    };
  } catch {
    return {};
  }
}
