/**
 * Whole-word matching for safety checks that matched risk phrases as bare
 * substrings (SAFETY_WHOLE_WORD_SITES = off | shadow | on, default off).
 * "spend it all" fired 'end it all' (crisis, 988) in safety-guards.ts, "casino
 * points" fired 'no point' (crisis line) in human-referral.ts, "send it" fired
 * 'end it' (crisis valence) in shared-vocabulary.ts, "give updates" fired
 * 'give up' (URGENT check-in) in predictive-context.ts, and "diet" boosted
 * crisis_support in the semantic router (matcher.ts).
 *
 * on: the phrase must start at a word edge, in STT spelling (phrase-match.ts:
 * apostrophes dropped, hyphens as spaces), and may end in an inflection or a
 * stretched last letter, so every real-risk form the substring check caught
 * still counts: "self-harming", "self-harmed", "suicides", "suicidally",
 * "hopelessness", "hopelessly", "numbness", "worthlessness", "cuttings",
 * "dieee", "die2". A short last word ("it", "me") takes no inflection, so "end
 * its" is not 'end it'. "not suicidal" and the like do not count (NOT_BEFORE).
 * shadow: logs each check where on would decide differently; decides as off.
 *
 * @module utils/safety-whole-word
 */

import {
  NOT_BEFORE,
  escape,
  logWouldDiffer,
  normalized,
  resolveShadowMode,
  sttSpelling,
  type ShadowMode,
} from './phrase-match.js';

type Env = Record<string, string | undefined>;
const FLAG = 'SAFETY_WHOLE_WORD_SITES';

export function resolveSafetyWholeWordSites(env: Env = process.env): ShadowMode {
  return resolveShadowMode(env.SAFETY_WHOLE_WORD_SITES);
}

const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}]/u.test(ch);
const SUFFIX = '(?:s|es|ed|d|ing|ly|ness)?(?!\\p{L})';

/** What may follow a match: an inflection after a last word of 3+ letters, else no letter. */
function endsWell(text: string, end: number, matched: string): boolean {
  const last = /\p{L}+$/u.exec(matched)?.[0] ?? '';
  if (last.length < 3) return !/\p{L}/u.test(text[end] ?? '');
  const tail = new RegExp(`^${escape(last.slice(-1))}*${SUFFIX}`, 'u');
  return tail.test(text.slice(end));
}

/** Whether some match of pattern starts at a word edge and ends well, and is not negated. */
function edgeMatch(pattern: RegExp, text: string): boolean {
  const re = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, '')}g`);
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const negated = NOT_BEFORE[m[0]]?.test(sttSpelling(text.slice(0, m.index))) ?? false;
    if (!isWordChar(text[m.index - 1]) && endsWell(text, end, m[0]) && !negated) return true;
    re.lastIndex = m.index + 1;
  }
  return false;
}

const phrases = new Map<string, RegExp>();
function phrasePattern(phrase: string): RegExp {
  let re = phrases.get(phrase);
  if (!re) {
    re = new RegExp(sttSpelling(phrase).trim().split(/\s+/).map(escape).join('\\s+'), 'u');
    phrases.set(phrase, re);
  }
  return re;
}

/**
 * off: today's reading. on: the whole-word one. shadow: today's, logging
 * where the whole-word reading differs. A site's readings never throw.
 */
export function wholeWordSite(
  site: string,
  today: () => boolean,
  wholeWord: () => boolean,
  env: Env = process.env
): boolean {
  const mode = resolveSafetyWholeWordSites(env);
  if (mode === 'off') return today();
  if (mode === 'on') return wholeWord();
  const was = today();
  const now = wholeWord();
  if (now !== was) logWouldDiffer({ flag: FLAG, phrase: site, site, would: now });
  return was;
}

/** text.toLowerCase().includes(phrase), or the whole-word reading with the flag on. */
export function saysPhrase(text: string, phrase: string, env: Env = process.env): boolean {
  return wholeWordSite(
    phrase,
    () => text.toLowerCase().includes(phrase),
    () => edgeMatch(phrasePattern(phrase), sttSpelling(text)),
    env
  );
}

/** pattern.test(text) for a safety regex written without \b, or the whole-word reading. */
export function testWholeWords(pattern: RegExp, text: string, env: Env = process.env): boolean {
  return wholeWordSite(
    pattern.source.slice(0, 60),
    () => pattern.test(text),
    () => edgeMatch(pattern, normalized(text)),
    env
  );
}
