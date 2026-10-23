/**
 * The words on "Ferni's on it" (engagement spec 5.1): one friend-language line
 * per row, from the teammate who owns it. Every string the screen shows that
 * isn't the person's own words comes from this table, so a scan of it is a
 * scan of the screen.
 *
 * Never a tool name, an id, "action", "executing", "request", "confirmed" or
 * "AI", and no em dashes or ellipses (AGENTS.md voice text rules).
 *
 * @module services/on-it/on-it-copy
 */

import type { ApprovalVerb, ErrandKind, ErrandState } from '../errands/index.js';
import type { FollowUpKind } from '../follow-through/index.js';

export type OnItPersona = 'ferni' | 'alex-chen' | 'peter-john';
export type OnItSectionId = 'waitingOnYou' | 'doing' | 'holding' | 'done';

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

/**
 * Who owns a follow-up. Alex is the chief of staff (todos, goals, dates on the
 * calendar), so Ferni hands those to Alex; Ferni keeps the everyday things.
 */
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

/** What the teammate is waiting on the person's okay for, by what they'd do next. */
const ASK: Record<ApprovalVerb, string> = {
  call: '{name} would like your okay to make some calls.',
  book: '{name} found an opening and would like your okay to book it.',
  text: '{name} would like your okay to send a text.',
  schedule: '{name} would like your okay to put it on your calendar.',
  next: '{name} would like your okay to try the next place.',
  release: '{name} would like your okay to let the hold go.',
};

export type DoingState = Exclude<ErrandState, 'done' | 'cancelled' | 'failed'>;

const DOING: Record<DoingState, string> = {
  planning: '{name} is getting started on this.',
  awaiting_owner: '{name} is getting started on this.',
  acting: '{name} is working on this right now.',
  waiting: '{name} is waiting to hear back.',
  verifying: '{name} is making sure it went through.',
  scheduled: '{name} will pick this back up soon.',
};

const COUNT = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

const HOLDING: Record<FollowUpKind, string> = {
  reminder: "I'll remind you.",
  commitment: "I'll check in on it.",
  promise: "I'll follow through.",
  thread: "I'll ask how it went.",
  date: "I'll remember the day.",
  dose: "I'll remind you.",
};

const fill = (line: string, persona: OnItPersona): string => line.replace('{name}', NAME[persona]);

/** The person's own words as a line: first letter up, nothing else touched. */
export const asLine = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const askDetail = (verb: ApprovalVerb, persona: OnItPersona): string =>
  fill(ASK[verb], persona);

export function doingDetail(state: DoingState, persona: OnItPersona, placesLeft: number): string {
  const line = fill(DOING[state], persona);
  if (placesLeft < 1 || (state !== 'acting' && state !== 'waiting')) return line;
  const n = COUNT[placesLeft] ?? String(placesLeft);
  return `${line} ${n} ${placesLeft === 1 ? 'place' : 'places'} left to try.`;
}

export const holdingDetail = (kind: FollowUpKind): string => HOLDING[kind];
export const slipped = (text: string): string => `I didn't get to this in time: ${text}`;

/** A call or text Ferni would make for them: what it is, never who it is for (holding.ts). */
export const ON_BEHALF = {
  call: 'A call you asked me to make',
  text: 'A message you asked me to send',
} as const;

/** Something Ferni read back to do for them that still waits on their yes. */
export const WAITING_ON_YES = "I'll check with you before it goes out.";

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

/** How one of their own follow-ups closed, in their words. */
export const closedLine = (status: 'done' | 'released' | 'expired', text: string): string =>
  status === 'done'
    ? `Done: ${text}`
    : status === 'released'
      ? `We let this one go: ${text}`
      : `This one passed before I got to it: ${text}`;

/** Every fixed string above, for the scan that keeps system words off the screen. */
export const ALL_COPY: readonly string[] = [
  ...Object.values(SECTION_TITLE),
  ...Object.values(ASK),
  ...Object.values(DOING),
  ...Object.values(HOLDING),
  ...Object.values(ON_BEHALF),
  ...Object.values(ON_BEHALF_DONE),
  WAITING_ON_YES,
  slipped(''),
  closedLine('done', ''),
  closedLine('released', ''),
  closedLine('expired', ''),
];
