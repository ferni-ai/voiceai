/**
 * The thread that decides the call's hello, if any, before a win, a check-in or a
 * pondered ask (those wait for a later call behind it). In order:
 * - why they called (CALL_LAUNCH_CONTEXT): their own reason always comes first;
 * - a call Ferni made for them (CALL_NEWS_OPENER, call-news-opener.ts);
 * - a letter to future them on the day it was promised (future-letters.ts);
 * - a date they told about (DATES_IN_HELLO, greeting-date.ts), which also waits on
 *   a same-day return and never meets a stranger.
 * None reaches a caller the line does not recognise (never someone else's letter).
 *
 * @module agents/multi-agent/first-thread
 */
import type { DateCandidate } from './greeting-date.js';

export interface FirstThread<News, Letter> {
  newsNow?: News;
  letterNow?: Letter;
  dateNow?: DateCandidate;
}

/** Pure: which of call news, a letter or a date leads the hello (none when they called for a reason). */
export function firstThread<News, Letter>(
  found: { news?: News; letter?: Letter; date?: DateCandidate },
  holds: { unknown: boolean; launched: boolean; dateWaits: boolean }
): FirstThread<News, Letter> {
  if (holds.unknown || holds.launched) return {};
  if (found.news !== undefined) return { newsNow: found.news };
  if (found.letter !== undefined) return { letterNow: found.letter };
  return holds.dateWaits || !found.date ? {} : { dateNow: found.date };
}
