/**
 * Picks up the caller's own words for the people in their life
 * (conversation/their-words.ts): read from committed user turns, kept on
 * userData.theirWords for the per-reply notes, and saved to
 * bogle_users/{id}/preferences/words so later calls start with them.
 *
 * @module agents/multi-agent/their-words-recorder
 */

import {
  detectTheirWords,
  isRole,
  mergeTheirWords,
  type TheirWords,
} from '../../conversation/their-words.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TheirWords' });

interface SessionEvents {
  on?: (event: string, handler: (event: unknown) => void) => void;
  off?: (event: string, handler: (event: unknown) => void) => void;
}

interface WordsHolder {
  theirWords?: TheirWords;
}

/** Their stored words, then new ones as they are heard. Returns the unsubscribe. */
export function wireTheirWordsRecorder(
  session: SessionEvents,
  userData: WordsHolder,
  save: (words: TheirWords) => void
): () => void {
  userData.theirWords ??= {};
  const onItem = (event: unknown) => {
    const item = (event as { item?: { role?: string; textContent?: string } })?.item;
    if (item?.role !== 'user' || !item.textContent) return;
    const heard = detectTheirWords(item.textContent);
    const known = (userData.theirWords ??= {});
    if (mergeTheirWords(known, heard)) {
      save(heard);
      log.info({ roles: Object.keys(heard) }, 'Their words picked up');
    }
  };
  session.on?.('conversation_item_added', onItem);
  return () => session.off?.('conversation_item_added', onItem);
}

/** Add stored words without overriding any heard this call. */
export function applyStoredWords(userData: WordsHolder, stored: TheirWords): void {
  userData.theirWords = { ...stored, ...(userData.theirWords ?? {}) };
}

const WORDS_DOC = 'words';

/** The caller's stored words. Never throws. */
export async function loadTheirWords(userId: string): Promise<TheirWords> {
  try {
    const db = getFirestoreDb();
    if (!db) return {};
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('preferences')
      .doc(WORDS_DOC)
      .get();
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const words: TheirWords = {};
    for (const [role, word] of Object.entries(data)) {
      if (isRole(role) && typeof word === 'string') words[role] = word;
    }
    return words;
  } catch (error) {
    log.warn({ error: String(error) }, 'Their words not loaded');
    return {};
  }
}

/** Save newly heard words (merged into the stored ones). Never throws. */
export async function saveTheirWords(userId: string, words: TheirWords): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('preferences')
      .doc(WORDS_DOC)
      .set(words, { merge: true });
  } catch (error) {
    log.warn({ error: String(error) }, 'Their words not saved');
  }
}
