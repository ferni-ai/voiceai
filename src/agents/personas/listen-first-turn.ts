/**
 * LISTEN_FIRST=on wiring for the per-turn reminder (turn-request.ts): when the
 * caller is low on energy, drop director notes that push Ferni to share, and
 * ask for a listening reply in place of the drawn shape (listen-first.ts).
 *
 * @module agents/personas/listen-first-turn
 */

import type { llm } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import {
  callerTimeZoneOf,
  listenFirstEnabled,
  listeningCuesFor,
  withoutSharingNotes,
} from './listen-first.js';
import { listeningShapeFor } from './turn-shape.js';

const log = createLogger({ module: 'FerniAgent' });

/** The cues for a listening reply, or null when the flag is off or the caller isn't low on energy. */
function listeningFor(
  chatCtx: llm.ChatContext,
  session: object
): ReturnType<typeof listeningCuesFor> {
  if (!listenFirstEnabled()) return null;
  const { userData } = session as { userData?: unknown };
  return listeningCuesFor(chatCtx.items, callerTimeZoneOf(userData));
}

/** Director notes for this reply: a caller low on energy gets none pushing Ferni to share. */
export function listeningNotes(
  notes: readonly string[],
  chatCtx: llm.ChatContext,
  session: object
): string[] {
  return listeningFor(chatCtx, session) ? withoutSharingNotes(notes) : [...notes];
}

/** The listening reply's reminder for these words, or null to draw the usual shape. */
export function listeningReply(
  said: string,
  chatCtx: llm.ChatContext,
  session: object
): string | null {
  const listening = listeningFor(chatCtx, session);
  if (!listening) return null;
  const turn = listeningShapeFor(said, listening);
  log.info({ move: turn.move, shape: turn.shape, extras: turn.extras }, 'TURN_SHAPE');
  return turn.reminder;
}
