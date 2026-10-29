/**
 * What Ferni says in place of an action claim the guard drops
 * (action-claim-guard.ts), and why the claim was false.
 *
 * @module agents/personas/honest-line
 */
import type { ActionKind, CallActions } from './action-claims.js';
import { EMERGENCY_LINE } from './emergency-claim.js';

/** An action, or a look-up ("I checked", "let me look"), judged with GROUNDED_CLAIMS (announced-check.ts). */
export type ClaimKind = ActionKind | 'lookup';
export type Kinds = ReadonlySet<ClaimKind>;
/** The call's tool results (callActions), read for a look-up too, which is never among them. */
export type SeenActions = {
  [K in keyof CallActions]: K extends 'heldWhen' ? CallActions[K] : Kinds;
};

/**
 * 'uncalled': a create tool is open, but no create ran on this call for this claim (#1547).
 * 'promised': "I'll text him" with the tool open, and none called yet in this reply (action-promises.ts).
 * 'emergency': he said he called emergency services or help, which he can't (emergency-claim.ts).
 */
export type MissReason =
  'no_tool' | 'failed' | 'awaiting' | 'held' | 'uncalled' | 'elsewhere' | 'promised' | 'emergency';

const DID_NOT_GO: Record<ClaimKind, string> = {
  call: "That call didn't go through, so nothing's been dialed.",
  send: "That didn't go through, so nothing's been sent.",
  ride: "That didn't go through, so no ride is booked.",
  schedule: "That didn't go through, so it isn't booked.",
  reminder: "That didn't go through, so there's no reminder set.",
  save: "That didn't go through, so it isn't saved.",
  lookup: "That look-up didn't go through, so I don't have an answer yet.",
};
const CANNOT: Record<ClaimKind, string> = {
  call: "I can't actually make calls for you, so I haven't rung anyone.",
  send: "I can't actually send messages for you, so nothing's gone out.",
  ride: "I can't actually order rides for you, so nothing's on its way.",
  schedule: "I can't actually book that for you, so it isn't booked.",
  reminder: "I can't actually set reminders for you, so there isn't one set.",
  save: "I can't actually save that for you, so it isn't saved.",
  lookup: "I can't look that up from here, so I don't want to guess.",
};
/** A yes/no question, since the gate sends only on a plain yes to it. */
const NOT_YET: Record<ClaimKind, string> = {
  call: "I haven't actually dialed yet, though. Should I go ahead and call?",
  send: "Nothing's gone out yet, though. Should I go ahead and send it?",
  ride: 'No ride is booked yet, though. Should I go ahead and book it?',
  schedule: "It isn't booked yet, though. Should I go ahead and book it?",
  reminder: "It isn't set yet, though. Should I go ahead and set it?",
  save: "It isn't saved yet, though. Should I go ahead and save it?",
  lookup: "I haven't actually looked that up yet, though. Want me to?",
};
/** A held action: set for later, not done (only calls are held today). */
const HELD: Record<ClaimKind, string> = {
  call: "I haven't dialed yet, though. The call is held for a better time.",
  send: "Nothing's gone out yet, though. It's held for a better time.",
  ride: "No ride is booked yet, though. It's held for later.",
  schedule: "It isn't booked yet, though. It's held for later.",
  reminder: "It isn't set yet, though. It's held for later.",
  save: "It isn't saved yet, though. It's held for later.",
  lookup: "I haven't looked that up yet, though.",
};
const INSTEAD: Record<ClaimKind, string> = {
  call: ' I can help you work out what to say, though.',
  send: ' I can help you word it, though.',
  ride: '',
  schedule: '',
  reminder: ' Maybe pop it in your phone so it nudges you.',
  save: '',
  lookup: '',
};
const REMIND = ' Want me to remind you to do it?';

/**
 * A held claim's line read naturally where the claim was, with the words held
 * after it: "though" only after words it can set itself against, and the
 * yes/no question last unless the reply already ends on a question. Dev sweep
 * 2026-10-21: "It isn't booked yet, though. Should I go ahead and book it? I'd
 * start by asking her..." opened a reply, contrasting with nothing and asking
 * mid-thought.
 */
export function inPlace(line: string, afterWords: boolean, rest: readonly string[]): string[] {
  const parts = /^(.*?[.!])\s+([^.!?]+\?)$/.exec(line);
  if (!parts) return [line, ...rest];
  const statement = afterWords ? parts[1] : parts[1].replace(/,? though([.!])$/, '$1');
  const asks = rest.length === 0 || /\?\W*$/.test(rest[rest.length - 1]);
  return asks ? [statement, parts[2], ...rest] : [statement, ...rest, parts[2]];
}

/** What Ferni says in place of a claim, and what he can do instead. */
export function honestLine(
  kind: ClaimKind,
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
  const remindable = kind === 'call' || kind === 'send' || kind === 'ride' || kind === 'schedule';
  const instead = canRemind && remindable ? REMIND : INSTEAD[kind];
  return `${reason === 'failed' ? DID_NOT_GO[kind] : CANNOT[kind]}${instead}`;
}
