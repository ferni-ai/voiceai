/**
 * Planning goes to Alex, the chief of staff (ALEX_CHIEF_OF_STAFF=on).
 *
 * Seth, 2026-10-18: "Agents should always hand off to specialized agents." So
 * todos, goals, the calendar, the schedule and the agenda are Alex's, and any
 * other persona offers him instead of answering as a generalist. Ferni decides
 * a handoff from the request itself: the turn note (turn-request.ts) and the
 * handoff tools' descriptions (handoff-factory.ts). The manifest's
 * handoff_triggers only feed the context builders' keyword hints.
 *
 * The note asks Ferni to offer Alex and hand off on a yes, which is what
 * HANDOFF_ASK_FIRST lets through (handoff-consent.ts: a yes right after an
 * offer naming him). A quick one-off reminder or timer is still his own: the
 * everyday basics stay on every persona (multi-agent/everyday-basics.ts).
 *
 * @module tools/handoff/chief-of-staff-note
 */

import {
  alexChiefOfStaffEnabled,
  CHIEF_OF_STAFF_ID,
} from '../../config/alex-chief-of-staff-flag.js';

/**
 * Words that ask for planning. Whole words and phrases only: "remind me to call
 * mom" is a quick reminder Ferni sets himself, and "my day was rough" wants Ferni.
 */
export const PLANNING_NEED =
  /\b(to-?dos?|to do list|(my|a|add|the) tasks?|(my|a|new|set) goals?|goals? for|calendar|(my|the) schedule|schedule (a|an|the|my|something)|agenda|appointments?|what'?s on my plate|what do i have (on |going on )?(today|tomorrow|this week)|plan (out )?(my|the) (day|week|month)|my (day|week) (look|looks) like|weekly review|do my week|remind me to plan)\b/;

/** Alex by id or by his short alias (personas/persona-ids.ts is another context's internals). */
const isChiefOfStaff = (id: string): boolean =>
  [CHIEF_OF_STAFF_ID, 'alex'].includes(id.trim().toLowerCase());

/** Did the agent's last reply already name Alex? Then the caller is answering that offer. */
const offeredJustNow = (lastAgentWords: string): boolean => /\balex\b/i.test(lastAgentWords);

/** What the agent said last, from the request's messages. */
export function lastAgentWordsIn(
  items: ReadonlyArray<{ type: string; role?: string; textContent?: string }>
): string {
  const said = items.filter((item) => item.type === 'message' && item.role === 'assistant');
  return said.at(-1)?.textContent ?? '';
}

/**
 * The planning line for one request; '' while the flag is off or Alex is speaking.
 *
 * @param speaker - the persona answering
 * @param callerWords - what the caller said since the agent last spoke
 * @param lastAgentWords - what the agent said just before that
 * @param scriptFree - SCRIPT_FREE_REMINDER=on: no quoted offer
 */
export function chiefOfStaffNote(
  speaker: string,
  callerWords: string,
  lastAgentWords = '',
  scriptFree = false
): string {
  if (!alexChiefOfStaffEnabled() || isChiefOfStaff(speaker)) return '';
  // SCRIPT_FREE_REMINDER=on (agents/personas/script-free.ts): no quoted offer to repeat.
  const like = scriptFree ? ',' : ', like "Want me to grab Alex? He keeps your schedule.",';
  const rule =
    "Alex is the caller's chief of staff: their todos, goals, calendar, schedule and agenda are his. " +
    `When they ask about any of those, offer him in a few words${like} ` +
    "and hand off once they say yes; don't plan it with them yourself, unless they'd rather not. " +
    'A quick one-off reminder or timer, you set yourself.';
  if (!PLANNING_NEED.test(callerWords.toLowerCase()) || offeredJustNow(lastAgentWords)) return rule;
  return `${rule} What they just said is planning: offer Alex now.`;
}

/** A handoff tool's description, naming Alex's role while the flag is on. */
export function chiefOfStaffDescription(agentId: string, description: string): string {
  if (!alexChiefOfStaffEnabled() || !isChiefOfStaff(agentId)) return description;
  return `${description} He is the caller's chief of staff: hand off to him for their todos, goals, calendar, schedule and agenda.`;
}

/** Alex's "when" in the TEAM_BY_NEED line (team-by-need-note.ts), with his planning role while the flag is on. */
export function chiefOfStaffWhen(id: string, when: string): string {
  if (!alexChiefOfStaffEnabled() || !isChiefOfStaff(id)) return when;
  return `todos, goals, calendar and agenda (their chief of staff), and ${when}`;
}
