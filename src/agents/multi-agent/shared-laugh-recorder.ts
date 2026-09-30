/**
 * Remembers what made the caller laugh.
 *
 * The audio processor stamps userData.detectedLaughter(At) when it hears a
 * laugh. When the caller's turn is committed, a laugh heard since their
 * previous turn means Ferni's reply in between got the laugh (often mid-
 * punchline, before that reply was even committed): it is saved as a shared laugh,
 * with what the caller had been talking about, for a later callback (see
 * memory/recall/shared-laughs.ts).
 *
 * @module agents/multi-agent/shared-laugh-recorder
 */

import { captureLaugh, type SharedLaugh } from '../../memory/recall/shared-laughs.js';
import { readUserLaugh } from '../../speech/expression/session-expression.js';

/** Enough to learn from without turning every chuckle into a "joke". */
const MAX_PER_CALL = 3;
const MIN_CONFIDENCE = 0.6;

interface ChatItem {
  type?: string;
  role?: string;
  textContent?: string;
}

interface SessionEvents {
  on?: (event: string, handler: (event: unknown) => void) => void;
  off?: (event: string, handler: (event: unknown) => void) => void;
}

export interface SharedLaughRecorderDeps {
  userData: Record<string, unknown>;
  save: (laugh: SharedLaugh) => Promise<void>;
  now?: () => number;
}

export function createSharedLaughRecorder(deps: SharedLaughRecorderDeps) {
  const now = deps.now ?? Date.now;
  let lastAgent: string | null = null;
  let lastUser: string | undefined;
  let lastUserAt = now();
  let saved = 0;

  return {
    /** A conversation item was committed (user or assistant). */
    onItem(item: ChatItem | undefined): void {
      if (item?.type !== 'message' || !item.textContent) return;
      if (item.role === 'assistant') {
        lastAgent = item.textContent;
        return;
      }
      if (item.role !== 'user') return;
      const laugh = readUserLaugh(deps.userData);
      const laughedAtReply =
        lastAgent !== null &&
        laugh !== undefined &&
        laugh.confidence >= MIN_CONFIDENCE &&
        laugh.suggestedResponse !== 'none' &&
        laugh.at > lastUserAt;
      if (laughedAtReply && lastAgent && saved < MAX_PER_CALL) {
        const shared = captureLaugh({
          agentLine: lastAgent,
          userLine: lastUser,
          at: laugh.at,
        });
        if (shared) {
          saved++;
          void deps.save(shared);
        }
        // One laugh anchors one moment.
        lastAgent = null;
      }
      lastUser = item.textContent;
      lastUserAt = now();
    },
  };
}

/** Feed the recorder from the session's events. Returns the unsubscribe. */
export function wireSharedLaughRecorder(
  session: SessionEvents,
  recorder: ReturnType<typeof createSharedLaughRecorder>
): () => void {
  const onItem = (event: unknown) => recorder.onItem((event as { item?: ChatItem })?.item);
  session.on?.('conversation_item_added', onItem);
  return () => session.off?.('conversation_item_added', onItem);
}
