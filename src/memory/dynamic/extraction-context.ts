/**
 * Conversational context for deep extraction.
 *
 * A user turn alone is often ambiguous ("Yes, she's seven" means nothing
 * without "How old is your daughter?"). When the job carries the preceding
 * assistant turn it is used directly; otherwise, if the job knows its
 * conversation, the last assistant turn before the user's words is read from
 * bogle_users/{uid}/conversations/{convId}/turns. Older pipelines that only
 * record user turns simply yield no context (feature detection by data).
 *
 * @module memory/dynamic/extraction-context
 */

import { USERS_COLLECTION, toMillis, type FirestoreLike } from './firestore-shapes.js';

export interface ExtractionContext {
  /** What the assistant said just before the user's turn. */
  previousAssistantTurn?: string;
}

/** Longest assistant context passed to the extractor. */
export const MAX_CONTEXT_CHARS = 600;

/** A user turn persisted within this window of the capture is the captured turn itself. */
const SELF_TURN_WINDOW_MS = 5_000;

function turnText(data: Record<string, unknown>): string {
  const text = data.text ?? data.content;
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * Find the assistant turn that preceded the user's turn at `before`.
 * Never throws: context is an enhancement.
 */
export async function loadPreviousAssistantTurn(
  db: FirestoreLike | null,
  userId: string,
  conversationId: string | undefined,
  before: Date
): Promise<string | undefined> {
  if (!db || !conversationId) return undefined;
  try {
    const snap = await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection('conversations')
      .doc(conversationId)
      .collection('turns')
      .orderBy('timestamp', 'desc')
      .limit(6)
      .get();
    const cutoff = before.getTime();
    for (const doc of snap.docs) {
      const data = doc.data() ?? {};
      const at = toMillis(data.timestamp);
      if (data.role === 'user') {
        // This user turn itself is persisted around capture time; skip it. An
        // earlier user turn means no assistant turn came directly before.
        if (!at || Math.abs(at - cutoff) <= SELF_TURN_WINDOW_MS || at > cutoff) continue;
        return undefined;
      }
      if (at && at > cutoff) continue; // the reply to this turn, or later
      if (data.role === 'assistant') {
        const text = turnText(data);
        if (text) return text.slice(-MAX_CONTEXT_CHARS);
      }
    }
  } catch {
    // Missing index or transient error: extract without context.
  }
  return undefined;
}

/** The transcript block the extraction prompts see. */
export function formatTranscriptForExtraction(
  userText: string,
  context?: ExtractionContext
): string {
  const prev = context?.previousAssistantTurn?.trim();
  if (!prev) return `"${userText}"`;
  return [
    'Context: the assistant said just before (use ONLY to resolve what the user refers to; never extract facts from it):',
    `ASSISTANT: "${prev.slice(-MAX_CONTEXT_CHARS)}"`,
    'Extract facts about the user ONLY from this line:',
    `USER: "${userText}"`,
  ].join('\n');
}
