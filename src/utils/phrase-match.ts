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
 * EARLY_WARNING_STT_FORMS (off | shadow | on, default off), in either mode:
 * a message that matched nothing gets a second, whole-word look that reads
 * speech-to-text spellings ("dont", "cant", "im", "wanna", "cannot", "any
 * more", hyphens as spaces) as the written ones and tries the extra forms in
 * STT_FORMS, minus the idioms and negations in NOT_BEFORE / NOT_AFTER. on can
 * only add matches; shadow logs each match on would add and decides as off.
 * The whole-word conversions of other safety checks are a separate flag
 * (SAFETY_WHOLE_WORD_SITES, safety-whole-word.ts).
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

export function resolveEarlyWarningSttForms(env: Env = process.env): ShadowMode {
  return resolveShadowMode(env.EARLY_WARNING_STT_FORMS);
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

/**
 * Extra forms of a listed phrase. A form is tried only when its phrase is in
 * the list being checked, so it lands at that list's severity. Forms that are
 * common in everyday speech ("I'm done", "I gave up", "ending it") sit under
 * the hopelessness phrases, which fire only with low hopefulness as well, and
 * still skip their everyday continuations (NOT_AFTER); crisis_risk fires on
 * its phrase alone, so only self-harm forms sit under its phrases.
 */
const STT_FORMS: Readonly<Record<string, readonly string[]>> = {
  // crisis_risk
  'kill myself': ['killing myself', 'suicidal'],
  'hurt myself': ['hurting myself', 'harm myself', 'harming myself'],
  'end it': [
    'ending it all',
    'end my life',
    'ending my life',
    'take my own life',
    'taking my own life',
  ],
  'want to die': ['wanting to die', 'wish i was dead', 'wish i were dead'],
  "can't take it anymore": ["can't take this anymore"],
  'better off without me': ['better off dead'],
  // hopelessness_pattern
  'give up': ['gave up', 'giving up', 'given up'],
  "can't go on": ["i'm done", 'ending it'],
};

/** "not suicidal", "never been suicidal", "isn't really suicidal". */
const NEGATED =
  /\b(?:not|never|isnt|wasnt|arent|werent|aint)\s+(?:(?:really|actually|been|feeling|being)\s+)?$/;
/** "killing myself laughing / at the gym / to make rent". Not "at night" or "to end the pain". */
const SELF_IDIOM =
  /^\s+(?:laughing|working|trying|skiing|lifting|at\s+(?:the\s+)?(?:gym|work|office)|to\s+(?:make|get|finish|pay|meet|keep)\b|over\s+(?:a|this|that|the)\s+(?:project|deadline|exam|test|job|paper))/;
/** "gave up smoking / my seat"; not "gave up on life", "gave up hope", "gave up." */
const UP_EVERYDAY =
  /^\s+(?!(?:on|hope|trying|everything|anything|anymore|already|completely|long|now|too|again|and|but|so|i|its|it|at|all|living|life)\b)[a-z]/;

/** A match of the form is not risk when the text before it ends like this. Keys in STT spelling. */
export const NOT_BEFORE: Readonly<Record<string, RegExp>> = { suicidal: NEGATED };
/** A match of the form is not risk when the text after it starts like this. Keys in STT spelling. */
const NOT_AFTER: Readonly<Record<string, RegExp>> = {
  'killing myself': SELF_IDIOM,
  'hurting myself': SELF_IDIOM,
  'im done':
    /^\s+(?:with|for)\s+(?!(?:it|this|everything|life|living|all|myself|trying|people|you)\b)[a-z]/,
  'gave up': UP_EVERYDAY,
  'giving up': UP_EVERYDAY,
  'given up': UP_EVERYDAY,
  'ending it': /^\s+(?:early|on\s+a|with\s+(?:him|her|them|my|the|a)\b)/,
};

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

/** Whether some match of re (global) in text survives its guards. */
function guardedMatch(re: RegExp, text: string, key: string): boolean {
  const before = NOT_BEFORE[key];
  const after = NOT_AFTER[key];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const blocked = before?.test(text.slice(0, m.index)) || after?.test(text.slice(end)) || false;
    if (!blocked) return true;
    re.lastIndex = m.index + 1;
  }
  return false;
}

const sttCompiled = new Map<string, RegExp>();

/** The whole-word pattern (global) for one phrase in STT spelling, cached. */
function sttWholeWord(spelled: string): RegExp {
  let re = sttCompiled.get(spelled);
  if (!re) {
    re = new RegExp(wholeWord(spelled).source, 'gu');
    sttCompiled.set(spelled, re);
  }
  return re;
}

/** The first STT form (or listed phrase in STT spelling) the message holds, or null. */
function sttForm(message: string, phrases: readonly string[]): string | null {
  const text = sttSpelling(message);
  for (const p of phrases) {
    for (const f of [p, ...(STT_FORMS[p] ?? [])]) {
      const spelled = sttSpelling(f);
      if (guardedMatch(sttWholeWord(spelled), text, spelled)) return f;
    }
  }
  return null;
}

/** Whether one message holds one of the phrases. */
export function mentions(
  message: string,
  phrases: readonly string[],
  env: Env = process.env
): boolean {
  const listed = listedMention(message, phrases, env);
  const mode = resolveEarlyWarningSttForms(env);
  if (listed || mode === 'off' || typeof message !== 'string') return listed;
  const form = sttForm(message, phrases);
  if (form && mode === 'shadow') logWouldDiffer({ flag: 'EARLY_WARNING_STT_FORMS', phrase: form });
  return mode === 'on' && form !== null;
}

function listedMention(message: string, phrases: readonly string[], env: Env): boolean {
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
