/**
 * How the early-warning detectors (wellbeing-tracking/early-warning.ts) find a phrase in the
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
 * @module utils/phrase-match
 */

import { createLogger } from './safe-logger.js';

type Env = Record<string, string | undefined>;
export type ShadowMode = 'off' | 'shadow' | 'on';

export function resolveEarlyWarningWordBoundary(env: Env = process.env): boolean {
  return env.EARLY_WARNING_WORD_BOUNDARY?.trim().toLowerCase() === 'on';
}

/** off | shadow | on from one env var; anything else is off. */
export function resolveShadowMode(raw: string | undefined): ShadowMode {
  const v = raw?.trim().toLowerCase();
  return v === 'on' || v === 'shadow' ? v : 'off';
}

const shadowLog = createLogger({ module: 'SafetyPhraseShadow' });

/**
 * One shadow line: which flag, which phrase, what on would decide. Never the
 * caller's words; join on the call's log context to review a line.
 */
export function logWouldDiffer(fields: {
  flag: string;
  phrase: string;
  [k: string]: unknown;
}): void {
  try {
    shadowLog.info(fields, 'safety phrase shadow: on would differ');
  } catch {
    // Logging never changes the decision.
  }
}

/** "not suicidal", "never been suicidal", "isn't really suicidal". */
const NEGATED =
  /\b(?:not|never|isnt|wasnt|arent|werent|aint)\s+(?:(?:really|actually|been|feeling|being)\s+)?$/;
/** A match of the form is not risk when the text before it ends like this. Keys in STT spelling. */
export const NOT_BEFORE: Readonly<Record<string, RegExp>> = { suicidal: NEGATED };

export const normalized = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'");

export const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

/** STT drops apostrophes, so they are dropped on both sides: can't = cant. */
const STT_SPELLINGS: ReadonlyArray<[RegExp, string]> = [
  [/'/g, ''],
  [/-/g, ' '],
  [/\bcan\s*not\b/g, 'cant'],
  [/\bdo\s+not\b/g, 'dont'],
  [/\bi\s+am\b/g, 'im'],
  [/\bwanna\b/g, 'want to'],
  [/\bany\s+more\b/g, 'anymore'],
  [/\bmy\s+self\b/g, 'myself'],
];

export const sttSpelling = (text: string): string =>
  STT_SPELLINGS.reduce((t, [re, to]) => t.replace(re, to), normalized(text));

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
