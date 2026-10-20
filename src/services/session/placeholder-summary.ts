/**
 * A placeholder last-call summary is never told to Ferni as a topic.
 *
 * Prod call 2026-10-19 (#2221): a caller's first call was one garbled line,
 * Ferni's name, then a hang-up. With nothing summarizable, the end-of-call
 * safeguard saved "Had a 1-minute conversation" (session-manager.ts,
 * utils.ts). The next call's prompt read "Last time you talked about: Had a
 * 1-minute conversation" beside "You talked earlier today.", and Ferni filled
 * the empty past himself: "we're both named Ferni", "what you said earlier
 * about feeling a bit stuck". The caller had said neither.
 *
 * PLACEHOLDER_SUMMARY_UNKNOWN=on replaces such a summary with a line saying
 * the content is unknown and must not be claimed. Off by default.
 *
 * @module services/session/placeholder-summary
 */
import { flagOn, type Env } from '../../config/env-flag.js';

/** The summaries the safeguard writes when nothing the caller said was kept. */
const PLACEHOLDER = /^(Had a \d+-minute conversation|Connected on \S.*)$/;

/** What Ferni is told instead of a placeholder summary. */
export const UNKNOWN_LAST_TOPIC =
  'You do not know what you talked about last time: nothing they said was kept. Never say or hint that you remember anything from it.';

/** True for a safeguard placeholder, not a real summary. */
export function isPlaceholderSummary(summary: string): boolean {
  return PLACEHOLDER.test(summary.trim());
}

/** The line to use instead of the summary, or undefined to keep the summary line. */
export function placeholderSummaryNote(
  summary: string,
  env: Env = process.env
): string | undefined {
  if (!flagOn('PLACEHOLDER_SUMMARY_UNKNOWN', env) || !isPlaceholderSummary(summary))
    return undefined;
  return UNKNOWN_LAST_TOPIC;
}
