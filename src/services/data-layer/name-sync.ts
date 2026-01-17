/**
 * Name Sync Utility
 *
 * Extracts user's name from memories and syncs it to their profile.
 * This handles the case where the user told us their name but it wasn't
 * persisted to the profile field (only stored as a memory).
 *
 * Common patterns we look for:
 * - "name is Seth"
 * - "my name is John"
 * - "I'm Sarah"
 * - "call me Mike"
 *
 * @module services/data-layer/name-sync
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import type { UserProfile } from '../../types/user-profile.js';

const log = createLogger({ module: 'NameSync' });

// Patterns to extract name from memory content
const NAME_PATTERNS = [
  /^name\s+is\s+(\w+)/i, // "name is Seth"
  /^my\s+name\s+is\s+(\w+)/i, // "my name is John"
  /^i'?m\s+(\w+)/i, // "I'm Sarah" or "Im Sarah"
  /^call\s+me\s+(\w+)/i, // "call me Mike"
  /^they\s+call\s+me\s+(\w+)/i, // "they call me Mike"
  /^i\s+go\s+by\s+(\w+)/i, // "I go by Mike"
  /^user'?s?\s+name\s+is\s+(\w+)/i, // "user's name is Seth"
  /^the\s+user'?s?\s+name\s+is\s+(\w+)/i, // "the user's name is Seth"
];

/**
 * Extract a name from memory content
 */
function extractNameFromContent(content: string): string | null {
  if (!content) return null;

  const trimmed = content.trim();

  for (const pattern of NAME_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      // Capitalize first letter
      const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      // Filter out common false positives
      const falsePOsitives = ['here', 'there', 'doing', 'good', 'fine', 'great', 'okay', 'ok'];
      if (!falsePOsitives.includes(name.toLowerCase())) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Sync name from memories to profile if profile.name is null
 *
 * @param userId - The user ID to sync
 * @param profile - The user's profile (optional - will be loaded if not provided)
 * @returns The extracted name if found, null otherwise
 */
export async function syncNameFromMemories(
  userId: string,
  profile?: UserProfile | null
): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available for name sync');
    return null;
  }

  try {
    // If profile provided, check if name already set
    if (profile?.name) {
      log.debug({ userId, name: profile.name }, 'Name already set in profile');
      return profile.name;
    }

    // Load memories and look for name
    const memoriesSnap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memories')
      .limit(50) // Only check recent memories
      .get();

    for (const doc of memoriesSnap.docs) {
      const data = doc.data();
      const content = data.content || data.fact || '';
      const extractedName = extractNameFromContent(content);

      if (extractedName) {
        log.info(
          { userId, extractedName, source: content.slice(0, 50) },
          '✅ Extracted name from memory, syncing to profile'
        );

        // Update profile with the name
        await db.collection('bogle_users').doc(userId).set(
          {
            name: extractedName,
            updatedAt: new Date(),
          },
          { merge: true }
        );

        return extractedName;
      }
    }

    log.debug({ userId, memoriesChecked: memoriesSnap.size }, 'No name found in memories');
    return null;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to sync name from memories');
    return null;
  }
}

/**
 * Fix existing user's name - call this for users who have name in memory but not profile
 */
export async function fixUserName(userId: string): Promise<boolean> {
  const name = await syncNameFromMemories(userId);
  return name !== null;
}

export default {
  syncNameFromMemories,
  extractNameFromContent,
  fixUserName,
};
