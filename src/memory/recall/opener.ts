/**
 * At the start of a call, ask about one open thread.
 *
 * The first recall note carries the open threads from earlier calls with
 * "use at most one, and only if it fits naturally", and the model took a
 * hello as never the natural moment: on the memory benchmark's call openers
 * (2026-10-11) Ferni answered "Hey Ferni, it's me!" with "How are you
 * doing?" in most calls, though the note held "How is Biscuit recovering
 * from his knee surgery?". A friend who remembers asks right away.
 *
 * OPENER_FOLLOW_UP=on adds this line to the first note when it has threads.
 *
 * @module memory/recall/opener
 */

export function openerFollowUpEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.OPENER_FOLLOW_UP === 'on';
}

export const OPENER_FOLLOW_UP_LINE =
  'This is the start of the call. After saying hello, ask about the one open thread above that matters most to them, briefly and warmly, the way a friend who remembers would. Never ask how something went before it has happened.';
