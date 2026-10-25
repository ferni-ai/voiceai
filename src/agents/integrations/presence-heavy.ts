/**
 * Whether a silence on this call is a heavy one: no idle hum, whistle, named
 * tune or yawn (presence-watcher.ts, voiced or not) and no tool hum in it.
 *
 * The voiced path (voiced-presence.ts), live on prod, only read the voice's
 * tone label (isHeavyMood), so "my dad died last week" said calmly could be
 * followed by a hum a few seconds later. The legacy path read the caller's
 * words, but only behind QUIRK_AWARENESS. This one check serves all three
 * sound paths, unflagged: a harm fix, like heavy-turn.ts.
 *
 * Heavy when the call has crisis risk noted (crisis-call-risk.ts), or any of
 * the caller's last HEAVY_LOOKBACK turns is hard news (isHeavyMoment) or
 * venting (callerVenting): the hard turn and the two after it stay serious,
 * so "haha anyway" right after grief doesn't make the silence an easy one.
 *
 * The live backchannels and the turn-opening sound use the grave half (crisis
 * or hard news, no venting): there they stay to the soft "mm"s, and an "Oof"
 * at "work was rough" is still a friend's answer.
 *
 * @module agents/integrations/presence-heavy
 */

import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { HEAVY_LOOKBACK, isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { callerVenting } from '../personas/turn-extras.js';

interface CallSession {
  userData?: unknown;
  history?: { items?: readonly unknown[] };
}

/** The caller's latest `n` turns in the session history, oldest first, per-turn notes aside. */
function recentCallerWords(session: object, n = HEAVY_LOOKBACK): string[] {
  const items = (session as CallSession).history?.items ?? [];
  const turns: string[] = [];
  for (let i = items.length - 1; i >= 0 && turns.length < n; i--) {
    const item = items[i] as { type?: string; role?: string; textContent?: string };
    if (item.type !== 'message' || item.role !== 'user') continue;
    const text = item.textContent ?? '';
    if (text && !text.startsWith(TURN_CONTEXT_HEADER)) turns.unshift(text);
  }
  return turns;
}

/** The hard turn and the two after it: "haha anyway" right after grief is still heavy. */
const recent = (turns: readonly string[]): readonly string[] => turns.slice(-HEAVY_LOOKBACK);

/**
 * Crisis risk on the call, or hard news (isHeavyMoment) in any of the caller's
 * last HEAVY_LOOKBACK `turns`, oldest first. The live backchannels and the turn
 * opener read this from their own record of the turns: soft "mm"s only.
 */
export function callIsGrave(sessionId: string | undefined, turns: readonly string[]): boolean {
  if (sessionId && crisisRiskThisCall(sessionId)) return true;
  return isHeavyMoment(recent(turns));
}

/** callIsGrave, or venting (callerVenting) in those turns: no presence sound at all. */
function callIsHeavy(sessionId: string | undefined, turns: readonly string[]): boolean {
  return callIsGrave(sessionId, turns) || recent(turns).some(callerVenting);
}

function sessionIdOf(session: object): string | undefined {
  const userData = (session as CallSession).userData as
    { services?: { sessionId?: string } } | undefined;
  return userData?.services?.sessionId;
}

/** callIsHeavy for a session, from its history: no idle sound or tool hum in this silence. */
export function presenceSilenceIsHeavy(session: object): boolean {
  return callIsHeavy(sessionIdOf(session), recentCallerWords(session));
}

/** callIsGrave for a session, from its history. */
export function sessionIsGrave(session: object): boolean {
  return callIsGrave(sessionIdOf(session), recentCallerWords(session));
}
