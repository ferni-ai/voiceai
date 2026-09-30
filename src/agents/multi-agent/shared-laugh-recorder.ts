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
 * It also learns which callbacks work. A callback offered on one turn is
 * judged at the caller's next turn: if Ferni's reply actually used it, a
 * laugh means it landed (the joke grows into a running joke) and silence
 * means it fell flat (twice, and it is retired).
 *
 * @module agents/multi-agent/shared-laugh-recorder
 */

import { captureLaugh, echoes, type SharedLaugh } from '../../memory/recall/shared-laughs.js';
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
  /** The callback recall offered during this user turn, if any. */
  takeOfferedCallback?: () => SharedLaugh | null;
  /** How a callback went, once Ferni has used it. */
  onCallbackOutcome?: (laugh: SharedLaugh, landed: boolean) => void;
  now?: () => number;
}

export function createSharedLaughRecorder(deps: SharedLaughRecorderDeps) {
  const now = deps.now ?? Date.now;
  let lastAgent: string | null = null;
  let lastUser: string | undefined;
  let lastUserAt = now();
  let saved = 0;
  let armed: SharedLaugh | null = null;
  // For fitting humor to the person across calls (conversation/humor-fit.ts)
  let turns = 0;
  let laughs = 0;

  return {
    /** A conversation item was committed (user or assistant). */
    onItem(item: ChatItem | undefined): void {
      if (item?.type !== 'message' || !item.textContent) return;
      if (item.role === 'assistant') {
        lastAgent = item.textContent;
        return;
      }
      if (item.role !== 'user') return;
      turns++;
      const laugh = readUserLaugh(deps.userData);
      const laughedAtReply =
        lastAgent !== null &&
        laugh !== undefined &&
        laugh.confidence >= MIN_CONFIDENCE &&
        laugh.suggestedResponse !== 'none' &&
        laugh.at > lastUserAt;

      if (laughedAtReply) laughs++;

      // Judge last turn's callback, if the reply actually used it.
      let judged = false;
      if (armed && lastAgent && echoes(lastAgent, armed)) {
        deps.onCallbackOutcome?.(armed, laughedAtReply);
        judged = laughedAtReply;
      }
      armed = deps.takeOfferedCallback?.() ?? null;

      // A laugh at a callback strengthens that joke; it is not a new moment.
      if (laughedAtReply && !judged && lastAgent && saved < MAX_PER_CALL) {
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
    /** This call so far: user turns and laughs at Ferni's replies. */
    tally(): { turns: number; laughs: number } {
      return { turns, laughs };
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

/** Turns before a call counts toward the humor read (not a misdial). */
const MIN_TURNS_FOR_HUMOR = 2;

/** What has been saved for this call already (a handoff saves more than once). */
export interface HumorSaved {
  call: boolean;
  laughs: number;
}

/**
 * The increments to store for this call so far: the call once, and laughs
 * heard since the last save. Null when there is nothing to add.
 */
export function humorIncrement(
  tally: { turns: number; laughs: number },
  saved: HumorSaved
): { calls: number; laughs: number } | null {
  if (tally.turns < MIN_TURNS_FOR_HUMOR) return null;
  const calls = saved.call ? 0 : 1;
  const laughs = Math.max(0, tally.laughs - saved.laughs);
  return calls === 0 && laughs === 0 ? null : { calls, laughs };
}
