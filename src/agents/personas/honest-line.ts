/**
 * What Ferni says in place of an action claim the guard drops
 * (action-claim-guard.ts), and why the claim was false.
 *
 * @module agents/personas/honest-line
 */
import type { ActionKind } from './action-claims.js';
import { EMERGENCY_LINE } from './emergency-claim.js';

/**
 * 'uncalled': a create tool is open, but no create ran on this call for this claim (#1547).
 * 'promised': "I'll text him" with the tool open, and none called yet in this reply (action-promises.ts).
 * 'emergency': he said he called emergency services or help, which he can't (emergency-claim.ts).
 */
export type MissReason =
  'no_tool' | 'failed' | 'awaiting' | 'held' | 'uncalled' | 'elsewhere' | 'promised' | 'emergency';

const DID_NOT_GO: Record<ActionKind, string> = {
  call: "That call didn't go through, so nothing's been dialed.",
  send: "That didn't go through, so nothing's been sent.",
  ride: "That didn't go through, so no ride is booked.",
  schedule: "That didn't go through, so it isn't booked.",
  reminder: "That didn't go through, so there's no reminder set.",
  save: "That didn't go through, so it isn't saved.",
};
const CANNOT: Record<ActionKind, string> = {
  call: "I can't actually make calls for you, so I haven't rung anyone.",
  send: "I can't actually send messages for you, so nothing's gone out.",
  ride: "I can't actually order rides for you, so nothing's on its way.",
  schedule: "I can't actually book that for you, so it isn't booked.",
  reminder: "I can't actually set reminders for you, so there isn't one set.",
  save: "I can't actually save that for you, so it isn't saved.",
};
/** A yes/no question, since the gate sends only on a plain yes to it. */
const NOT_YET: Record<ActionKind, string> = {
  call: "I haven't actually dialed yet, though. Should I go ahead and call?",
  send: "Nothing's gone out yet, though. Should I go ahead and send it?",
  ride: 'No ride is booked yet, though. Should I go ahead and book it?',
  schedule: "It isn't booked yet, though. Should I go ahead and book it?",
  reminder: "It isn't set yet, though. Should I go ahead and set it?",
  save: "It isn't saved yet, though. Should I go ahead and save it?",
};
/** A held action: set for later, not done (only calls are held today). */
const HELD: Record<ActionKind, string> = {
  call: "I haven't dialed yet, though. The call is held for a better time.",
  send: "Nothing's gone out yet, though. It's held for a better time.",
  ride: "No ride is booked yet, though. It's held for later.",
  schedule: "It isn't booked yet, though. It's held for later.",
  reminder: "It isn't set yet, though. It's held for later.",
  save: "It isn't saved yet, though. It's held for later.",
};
const INSTEAD: Record<ActionKind, string> = {
  call: ' I can help you work out what to say, though.',
  send: ' I can help you word it, though.',
  ride: '',
  schedule: '',
  reminder: ' Maybe pop it in your phone so it nudges you.',
  save: '',
};
const REMIND = ' Want me to remind you to do it?';

/** What Ferni says in place of a claim, and what he can do instead. */
export function honestLine(
  kind: ActionKind,
  reason: MissReason,
  canRemind: boolean,
  when?: string
): string {
  if (reason === 'emergency') return EMERGENCY_LINE;
  if (reason === 'elsewhere') return "It's saved to Ferni's own list, not your calendar.";
  if (reason === 'awaiting' || reason === 'uncalled' || reason === 'promised') return NOT_YET[kind];
  if (reason === 'held') {
    return kind === 'call' && when
      ? `I haven't dialed yet, though. I'll call ${when} their time.`
      : HELD[kind];
  }
  const instead = canRemind && kind !== 'reminder' && kind !== 'save' ? REMIND : INSTEAD[kind];
  return `${reason === 'failed' ? DID_NOT_GO[kind] : CANNOT[kind]}${instead}`;
}
