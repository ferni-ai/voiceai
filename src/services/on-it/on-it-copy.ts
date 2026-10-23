/**
 * The words on "Ferni's on it" (engagement spec 5.1). Every string the screen
 * shows that isn't the person's own words comes from here, so a scan of
 * ALL_COPY is a scan of the screen: never a tool name, an id, "action",
 * "executing", "request", "confirmed" or "AI", and no em dashes or ellipses.
 *
 * @module services/on-it/on-it-copy
 */

import type { ApprovalVerb, ErrandKind, ErrandState } from '../errands/index.js';
import type { FollowUpKind } from '../follow-through/index.js';

export type OnItPersona = 'ferni' | 'alex-chen' | 'peter-john';
export type OnItSectionId = 'waitingOnYou' | 'doing' | 'holding' | 'done';
export type DoingState = Exclude<ErrandState, 'done' | 'cancelled' | 'failed'>;
export type ClosedStatus = 'done' | 'released' | 'expired';

const NAME: Record<OnItPersona, string> = {
  ferni: 'Ferni',
  'alex-chen': 'Alex',
  'peter-john': 'Peter',
};

export const SECTION_TITLE: Record<OnItSectionId, string> = {
  waitingOnYou: 'Waiting on you',
  doing: 'On it',
  holding: 'Holding for you',
  done: 'Done lately',
};

/** Alex is chief of staff (todos, goals, dates), so Ferni hands those off and keeps the everyday. */
export const FOLLOW_UP_PERSONA: Record<FollowUpKind, OnItPersona> = {
  reminder: 'alex-chen',
  commitment: 'alex-chen',
  date: 'alex-chen',
  promise: 'ferni',
  thread: 'ferni',
  dose: 'ferni',
};

/** Errands are Alex's, except weighing up a purchase, which is money: Peter. */
export const ERRAND_PERSONA: Record<ErrandKind, OnItPersona> = {
  appointment: 'alex-chen',
  reservation: 'alex-chen',
  inquiry: 'alex-chen',
  custom: 'alex-chen',
  'purchase-research': 'peter-john',
};

const ASK: Record<ApprovalVerb, string> = {
  call: '{name} would like your okay to make some calls.',
  book: '{name} found an opening and would like your okay to book it.',
  text: '{name} would like your okay to send a text.',
  schedule: '{name} would like your okay to put it on your calendar.',
  next: '{name} would like your okay to try the next place.',
  release: '{name} would like your okay to let the hold go.',
};

const DOING: Record<DoingState, string> = {
  planning: '{name} is getting started on this.',
  awaiting_owner: '{name} is getting started on this.',
  acting: '{name} is working on this right now.',
  waiting: '{name} is waiting to hear back.',
  verifying: '{name} is making sure it went through.',
  scheduled: '{name} will pick this back up soon.',
};

export const HOLDING: Record<FollowUpKind, string> = {
  reminder: "I'll remind you.",
  commitment: "I'll check in on it.",
  promise: "I'll follow through.",
  thread: "I'll ask how it went.",
  date: "I'll remember the day.",
  dose: "I'll remind you.",
};

/** How one of their own follow-ups closed, before their words. */
const CLOSED: Record<ClosedStatus, string> = {
  done: 'Done: ',
  released: 'We let this one go: ',
  expired: 'This one passed before I got to it: ',
};

/** A call or text Ferni would make for them: what it is, never who it is for (holding.ts). */
export const ON_BEHALF = {
  call: 'A call you asked me to make',
  text: 'A message you asked me to send',
  waiting: "I'll check with you before it goes out.",
} as const;

/** How a call or text Ferni made for them ended. Never who it was for, never the words. */
export const ON_BEHALF_DONE = {
  sentCall: 'Made the call you asked me to make.',
  sentText: 'Sent the message you asked me to send.',
  failed: "That one didn't go through.",
  unknown: "I'm not sure that went through, so I didn't try again.",
  notSent: "I didn't send it. You said not this time.",
  held: "I didn't send it.",
  passed: "I didn't send it. The moment passed.",
} as const;

const SLIPPED = "I didn't get to this in time: ";
const COUNT = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const fill = (line: string, p: OnItPersona): string => line.replace('{name}', NAME[p]);

/** The person's own words as a line: first letter up, nothing else touched. */
export const asLine = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
export const askDetail = (verb: ApprovalVerb, p: OnItPersona): string => fill(ASK[verb], p);
export const slipped = (text: string): string => SLIPPED + text;
export const closedLine = (status: ClosedStatus, text: string): string => CLOSED[status] + text;

export function doingDetail(state: DoingState, p: OnItPersona, placesLeft: number): string {
  const line = fill(DOING[state], p);
  if (placesLeft < 1 || (state !== 'acting' && state !== 'waiting')) return line;
  const n = COUNT[placesLeft] ?? String(placesLeft);
  return `${line} ${n} ${placesLeft === 1 ? 'place' : 'places'} left to try.`;
}

/** Every fixed string above, for the scan that keeps system words off the screen. */
export const ALL_COPY: readonly string[] = [
  ...[SECTION_TITLE, ASK, DOING, HOLDING, CLOSED, ON_BEHALF, ON_BEHALF_DONE].flatMap((t) =>
    Object.values(t)
  ),
  SLIPPED,
];
