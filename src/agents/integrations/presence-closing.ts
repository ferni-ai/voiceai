/**
 * Whether the call is ending: no idle hum, whistle, tune, yawn or snore
 * (presence-watcher.ts, voiced or not) and no tool hum after it.
 *
 * stayQuietOn alone missed it twice in the playful A/B (2026-10-25). It holds
 * only once both goodbyes are said under CALL_WRAP_UP, so a caller's "I'll
 * talk to you later" answered by "Get some rest, Sam" wasn't an ending. And
 * it reads the farewell watcher's own record, which the session's close
 * clears, so a whistle armed at Ferni's goodbye played 2-3 s after the call
 * had been marked closing.
 *
 * Ending when the call is closing (session-closing-tracker.ts), both goodbyes
 * were said (stayQuietOn, call-farewell.ts), Ferni's latest lines say goodbye
 * (ferniSaysGoodbye), or the caller's latest turn is a goodbye or them leaving
 * (leavingNow). Read from the session's history each time, so a caller who
 * carries on ("oh wait, one more thing") makes the silences easy again. An
 * unflagged harm fix: it only ever holds a sound back.
 *
 * @module agents/integrations/presence-closing
 */

import { ferniSaysGoodbye, leavingNow, stayQuietOn } from '../shared/call-farewell.js';
import { isSessionClosing } from '../shared/session-closing-tracker.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

interface CallSession {
  userData?: unknown;
  history?: { items?: readonly unknown[] };
}

/** Ferni said goodbye since the caller's latest turn, or that turn is a goodbye. */
function closingLineSaid(session: object): boolean {
  const items = (session as CallSession).history?.items ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as { type?: string; role?: string; textContent?: string };
    const text = item.textContent ?? '';
    if (item.type !== 'message' || !text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    if (item.role === 'user') return leavingNow(text);
    if (item.role === 'assistant' && ferniSaysGoodbye(text)) return true;
  }
  return false;
}

/** The call is closing, or its last lines said goodbye: no presence sound now. */
export function presenceCallEnding(session: object): boolean {
  if (stayQuietOn(session)) return true;
  const userData = (session as CallSession).userData as
    { services?: { sessionId?: string } } | undefined;
  const sessionId = userData?.services?.sessionId;
  if (sessionId && isSessionClosing(sessionId)) return true;
  return closingLineSaid(session);
}
