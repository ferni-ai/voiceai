/**
 * What Ferni says when no calendar provider is connected (#1547).
 *
 * Ferni's own list always answers, so without these lines a read would sound
 * like the caller's calendar. Shared by the tool gate and the chat executor.
 */

export const NOT_CONNECTED_READ =
  "No calendar is connected yet, so I can't see your calendar. Want me to help you connect one?";
export const NOT_CONNECTED_CREATE =
  "Nothing was added to a calendar, because none is connected. I saved it to Ferni's own list instead, not your calendar. Want me to help you connect one?";
export const NOT_CONNECTED_CHANGE =
  "Nothing changed on a calendar, because none is connected. I changed Ferni's own list instead, not your calendar. Want me to help you connect one?";
