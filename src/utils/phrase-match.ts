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
 * EARLY_WARNING_STT_FORMS=on (default off), in either mode: a message that
 * matched nothing gets a second, whole-word look that reads speech-to-text
 * spellings ("dont", "cant", "im", "wanna", "cannot", "any more") as the
 * written ones and tries the extra forms in STT_FORMS. It can only add
 * matches, never remove one. The same flag moves other crisis checks that
 * matched bare substrings onto whole words: saysPhrase, testWholeWords and
 * the semantic router's crisis context boost (routerContextMentions).
 *
 * @module utils/phrase-match
 */

type Env = Record<string, string | undefined>;

export function resolveEarlyWarningWordBoundary(env: Env = process.env): boolean {
  return env.EARLY_WARNING_WORD_BOUNDARY?.trim().toLowerCase() === 'on';
}

export function resolveEarlyWarningSttForms(env: Env = process.env): boolean {
  return env.EARLY_WARNING_STT_FORMS?.trim().toLowerCase() === 'on';
}

/**
 * Extra forms of a listed phrase. A form is tried only when its phrase is in
 * the list being checked, so it lands at that list's severity. Forms that are
 * common in everyday speech ("I'm done with dinner", "I gave up sugar",
 * "ending it early") sit under the hopelessness phrases, which fire only with
 * low hopefulness as well; crisis_risk fires on its phrase alone, so only
 * self-harm forms sit under its phrases.
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

/** STT drops apostrophes, so they are dropped on both sides: can't = cant. */
const STT_SPELLINGS: ReadonlyArray<[RegExp, string]> = [
  [/'/g, ''],
  [/\bcan\s*not\b/g, 'cant'],
  [/\bdo\s+not\b/g, 'dont'],
  [/\bi\s+am\b/g, 'im'],
  [/\bwanna\b/g, 'want to'],
  [/\bany\s+more\b/g, 'anymore'],
  [/\bmy\s+self\b/g, 'myself'],
];

const sttSpelling = (text: string): string =>
  STT_SPELLINGS.reduce((t, [re, to]) => t.replace(re, to), normalized(text));

const sttCompiled = new Map<string, RegExp>();

/** The whole-word pattern for one phrase in STT spelling, cached. */
function sttWholeWord(phrase: string): RegExp {
  let re = sttCompiled.get(phrase);
  if (!re) {
    re = wholeWord(sttSpelling(phrase));
    sttCompiled.set(phrase, re);
  }
  return re;
}

/** Whether one message holds one of the phrases. */
export function mentions(
  message: string,
  phrases: readonly string[],
  env: Env = process.env
): boolean {
  const listed = listedMention(message, phrases, env);
  if (listed || !resolveEarlyWarningSttForms(env) || typeof message !== 'string') return listed;
  const text = sttSpelling(message);
  return phrases.some((p) => [p, ...(STT_FORMS[p] ?? [])].some((f) => sttWholeWord(f).test(text)));
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

/**
 * Whether text holds one phrase, for safety checks outside early-warning.ts
 * that used a bare substring check. Flag on: whole words in STT spelling, so
 * 'end it all' stops firing on "spend it all" and "cant go on" now counts.
 * Flag off: text.toLowerCase().includes(phrase), as those call sites did.
 * No STT_FORMS: a form belongs to the list it was audited for.
 */
export function saysPhrase(text: string, phrase: string, env: Env = process.env): boolean {
  if (!resolveEarlyWarningSttForms(env)) return text.toLowerCase().includes(phrase);
  return sttWholeWord(phrase).test(sttSpelling(text));
}

/**
 * The semantic router's context boost (tools/semantic-router/matcher.ts) on
 * one keyword: crisis tools' keywords go through saysPhrase, so 'die' stops
 * boosting crisis_support on "diet". Other tools keep the substring check.
 */
export function routerContextMentions(
  text: string,
  keyword: string,
  category: string,
  env: Env = process.env
): boolean {
  return category === 'crisis' ? saysPhrase(text, keyword, env) : text.includes(keyword);
}

const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}]/u.test(ch);

/**
 * pattern.test(text) for a safety regex written without \b. Flag on: a match
 * counts only when it starts and ends at a word edge, so /no point/ stops
 * firing on "casino points". Flag off: pattern.test(text).
 */
export function testWholeWords(pattern: RegExp, text: string, env: Env = process.env): boolean {
  if (!resolveEarlyWarningSttForms(env)) return pattern.test(text);
  const flags = pattern.flags.replace(/[gy]/g, '');
  const re = new RegExp(pattern.source, `${flags}g`);
  const str = normalized(text);
  for (let m = re.exec(str); m; m = re.exec(str)) {
    const end = m.index + m[0].length;
    if (!isWordChar(str[m.index - 1]) && !isWordChar(str[end])) return true;
    re.lastIndex = m.index + 1;
  }
  return false;
}

/** Whether any of the messages holds one of the phrases. False for no messages. */
export function mentionsAny(
  messages: readonly string[] | undefined,
  phrases: readonly string[],
  env: Env = process.env
): boolean {
  return messages?.some((m) => mentions(m, phrases, env)) ?? false;
}
