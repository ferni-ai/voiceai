/**
 * How the early-warning detectors (early-warning.ts) find a phrase in the
 * caller's words. EARLY_WARNING_WORD_BOUNDARY=on matches whole words only.
 *
 * Prod, 2026-10-22: a canary caller said "I actually did send it Wednesday
 * night". The crisis_risk detector looks for 'end it' with a plain substring
 * check, found it inside "send it", and logged crisis_risk at severity urgent,
 * whose prompt injection says "Provide crisis resources immediately". Thirteen
 * phrases in those lists overlap everyday words the same way: 'end it' in
 * "spend it", "recommend it", "pretend it"; 'want to die' in "want to diet";
 * 'better off without me' in "without meat"; 'give up' in "give updates";
 * "can't go on" in "can't go online"; 'no point' in "casino points"; "what's
 * the use" in "what's the username"; 'alone' in "standalone"; 'staying home'
 * in "staying homeless"; "can't face" in "can't FaceTime"; 'what if' in
 * "somewhat if"; "can't sleep" in "can't sleepwalk"; 'why bother' in "why
 * bothered".
 *
 * off (default): the substring check, exactly as before. on: the phrase must
 * start and end at a word edge (no letter or digit on either side), spaces in
 * it match any run of whitespace, and curly apostrophes count as straight
 * ones, so "can’t sleep" now matches "can't sleep" too.
 *
 * @module services/wellbeing-tracking/phrase-match
 */

type Env = Record<string, string | undefined>;

export function resolveEarlyWarningWordBoundary(env: Env = process.env): boolean {
  return env.EARLY_WARNING_WORD_BOUNDARY?.trim().toLowerCase() === 'on';
}

const normalized = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'");

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compiled = new Map<string, RegExp>();

/** The whole-word pattern for one phrase, cached. */
function wholeWord(phrase: string): RegExp {
  let re = compiled.get(phrase);
  if (!re) {
    const body = normalized(phrase).trim().split(/\s+/).map(escape).join('\\s+');
    re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'u');
    compiled.set(phrase, re);
  }
  return re;
}

/** Whether one message holds one of the phrases. */
export function mentions(
  message: string,
  phrases: readonly string[],
  env: Env = process.env
): boolean {
  if (!resolveEarlyWarningWordBoundary(env)) {
    const lower = message.toLowerCase();
    return phrases.some((p) => lower.includes(p));
  }
  if (typeof message !== 'string') return false;
  const text = normalized(message);
  return phrases.some((p) => wholeWord(p).test(text));
}

/** Whether any of the messages holds one of the phrases. False for no messages. */
export function mentionsAny(
  messages: readonly string[] | undefined,
  phrases: readonly string[],
  env: Env = process.env
): boolean {
  return messages?.some((m) => mentions(m, phrases, env)) ?? false;
}
