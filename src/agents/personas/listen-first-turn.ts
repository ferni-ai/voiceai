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
  listeningLines,
  withoutSharingNotes,
  type ListeningCues,
} from './listen-first.js';
import { callerMove, REGISTER, type TurnShape } from './turn-shape.js';

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
  session: object,
  scriptFree = false
): string | null {
  const listening = listeningFor(chatCtx, session);
  if (!listening) return null;
  const turn = listeningShapeFor(said, listening, scriptFree);
  log.info({ move: turn.move, shape: turn.shape, extras: turn.extras }, 'TURN_SHAPE');
  return turn.reminder;
}

/**
 * LISTEN_FIRST=on, caller low on energy (listen-first.ts): no second story, no
 * stance, no rough self-correction to dress up a monologue; a few words, an
 * easy question every other turn at most, or just company.
 */
export function listeningShapeFor(
  userText: string,
  cues: Omit<ListeningCues, 'aboutFerni'>,
  scriptFree = false
): TurnShape {
  const move = callerMove(userText);
  const lines = listeningLines({ ...cues, aboutFerni: move === 'about_ferni' });
  // SCRIPT_FREE_REMINDER=on (script-free.ts): the lines about them, without the shared register.
  const reminder = (scriptFree ? lines : [REGISTER, ...lines]).join(' ');
  return { move, shape: 'one', reminder, extras: ['listen_first'] };
}
