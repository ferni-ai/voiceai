/**
 * What Ferni says when no calendar is connected (#1547).
 *
 * Ferni's own list always answers, so without these lines a read would sound
 * like the caller's calendar. Shared by the tool gate, the chat executor and
 * the claim guard's honest line.
 */

export const NOT_CONNECTED_READ =
  "No calendar is connected yet, so I can't see your calendar. Want me to help you connect one?";

/** A create saved to Ferni's own list. `what` is the title and time, when known. */
/** Ferni's own list has items today, named and labelled (#1547). */
export const notConnectedWithList = (list: string): string =>
  `No calendar is connected, but on Ferni's own list you have: ${list}. Want me to help you connect one?`;

export const notConnectedCreate = (what?: string): string =>
  `Saved ${what ? `"${what}" ` : ''}to Ferni's own list. It isn't on your calendar, since none is connected. Want me to help you connect one?`;

export const NOT_CONNECTED_CREATE_FAILED =
  "I couldn't save that, and nothing was added to a calendar, since none is connected.";
export const NOT_CONNECTED_CHANGE =
  "Nothing changed on a calendar, because none is connected. I changed Ferni's own list instead, not your calendar. Want me to help you connect one?";
export const NOT_CONNECTED_CHANGE_FAILED =
  "I couldn't change that, and nothing changed on a calendar, since none is connected.";
