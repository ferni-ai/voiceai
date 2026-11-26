/**
 * Words in a log line: a length on prod, the text on dev. Its own module so safe-logger
 * (which truncates with it) stays under the file-size ratchet; safe-logger re-exports both.
 * lengthsOf and outboundFields are the always-a-length forms, for the caller's own words in a
 * writer's log fields (a reminder, a title, a subject) and for a third party's contact.
 */
import { isKnownDevDatabase } from '../config/firestore-database.js';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * True when LOG_FULL_RESPONSES lifts the truncation of logged text. It only counts on a
 * dev process (one on dev's Firestore database, by its exact name: the dev agent, PR
 * previews, a local run on ferni-dev). Prod images run NODE_ENV=production on dev as
 * well, so NODE_ENV cannot tell them apart; the database can. A process that does not set
 * it, or sets a name that is not dev's (a misspelling included), counts as prod.
 * LOG_FULL_RESPONSES alone never brings text back in prod.
 *
 * WARNING: This can produce very large log output. Only use for debugging.
 */
export function isFullLoggingEnabled(env: Env = process.env): boolean {
  return env.LOG_FULL_RESPONSES === 'true' && isKnownDevDatabase(env);
}

/**
 * Words for a log line: Ferni's own (a reply, TTS text, LLM output) or what the caller said
 * (a transcript, an intention, a commitment). Prod logs how long they are, e.g. `[148 chars]`,
 * and never the text, for everyone (#4392): a reply can echo what the caller said or their
 * name, so a logged reply is a logged caller. A dev process (isKnownDevDatabase) logs the
 * text, cut at `maxLength` unless isFullLoggingEnabled().
 */
export function replyForLog(text: string | undefined | null, maxLength = 300): string {
  if (!text) return '[0 chars]';
  if (!isKnownDevDatabase()) return `[${text.length} chars]`;
  if (isFullLoggingEnabled() || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/** replyForLog for each of several pieces of text (the matches of a regex), same cut for all. */
export const repliesForLog = (texts: string[], maxLength = 300): string[] =>
  texts.map((text) => replyForLog(text, maxLength));

/**
 * Each string field as `<name>Length`, on dev and prod alike; a field that is not a string is
 * left out. A reminder's message, an alarm's label or a task's title is the caller's own words,
 * and logs carry ids, enums, counts and lengths only (#4322): `lengthsOf({ label })` gives
 * `{ labelLength: 5 }`, enough to see that a field was set and how long it was.
 */
export function lengthsOf(fields: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'string') out[`${name}Length`] = value.length;
  }
  return out;
}

/**
 * Fields for a message to someone else: whether a recipient was named, never who (a third
 * party's contact, #4326), and every other string field as its length.
 */
export function outboundFields({
  recipient,
  ...rest
}: Record<string, unknown>): Record<string, boolean | number> {
  return { hasRecipient: Boolean(recipient), ...lengthsOf(rest) };
}
