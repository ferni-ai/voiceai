/**
 * Safety phrase readers behind SAFETY_WHOLE_WORD_SITES (off | shadow | on,
 * default off). Several crisis checks matched risk phrases as bare substrings,
 * so everyday words fired them: "spend it all" ('end it all', crisis, 988),
 * "casino points" ('no point', crisis line), "pharmacy" ('harm').
 *
 * off: the substring (or regex) check, exactly as before.
 * on: never reads less than off. Every match off finds still counts, however
 * the word around it starts or ends ("can't go onnn", "self-harmer",
 * "imsuicidal"), and on adds STT spellings ("i cant go on", "self harm",
 * "selfharm", curly apostrophes). A match that lies inside a listed everyday
 * word (EVERYDAY_WORDS) is not dropped: phraseHit / patternHit call it 'soft',
 * and the consumer steps it down to its softer tier (check-in, classifier).
 * shadow: decides as off, logging each check where on would differ.
 *
 * @module utils/safety-whole-word
 */

import {
  escape,
  logWouldDiffer,
  normalized,
  resolveShadowMode,
  sttSpelling,
  type ShadowMode,
} from './phrase-match.js';

type Env = Record<string, string | undefined>;
const FLAG = 'SAFETY_WHOLE_WORD_SITES';

/** 'hit': a match outside listed everyday words. 'soft': only inside them. null: no match. */
export type Hit = 'hit' | 'soft' | null;

export function resolveSafetyWholeWordSites(env: Env = process.env): ShadowMode {
  return resolveShadowMode(env.SAFETY_WHOLE_WORD_SITES);
}

/**
 * Everyday words that hold a risk word, keyed by that risk word as the first
 * or last word of a match: "spend it all" holds 'end it all' ('end' inside
 * "spend"), "give updates" holds 'give up' ('up' inside "updates"). A match is
 * 'soft' when the word around its first or last word is listed here. Never
 * key a word that is itself a risk subject (no "she" under 'he').
 */
export const EVERYDAY_WORDS: Readonly<Record<string, readonly string[]>> = {
  end: ['send', 'spend', 'lend', 'pretend', 'recommend'],
  kill: ['skill'],
  no: ['casino'],
  point: ['pointers', 'points'],
  harm: ['pharmacy', 'harmony'],
  die: ['studied', 'audience', 'diet'],
  dead: ['deadline'],
  urgent: ['insurgent'],
  numb: ['number', 'numbers'],
  empty: ['emptyhanded'],
  up: ['updates'],
  on: ['online'],
  use: ['username'],
  irs: ['stairs', 'first'],
  tax: ['syntax', 'taxi'],
};

const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}]/u.test(ch);
const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** The whole word (lowercased) around index i of text. */
function wordAt(text: string, i: number): string {
  let a = i;
  while (a > 0 && isWordChar(text[a - 1])) a--;
  let b = i;
  while (b < text.length && isWordChar(text[b])) b++;
  return text.slice(a, b).toLowerCase();
}

/** Whether a match lies inside a listed everyday word at its first or last word. */
function insideEveryday(text: string, index: number, matched: string): boolean {
  const w = words(matched);
  if (w.length === 0) return false;
  const [first, last] = [w[0], w[w.length - 1]];
  const start = wordAt(text, index);
  if (start !== first && EVERYDAY_WORDS[first]?.includes(start)) return true;
  const end = wordAt(text, index + matched.length - 1);
  return end !== last && (EVERYDAY_WORDS[last]?.includes(end) ?? false);
}

/** 'hit' if any match of re in text lies outside listed everyday words; every match is tried. */
function tierIn(re: RegExp, text: string): Hit {
  const g = new RegExp(re.source, `${re.flags.replace(/[gy]/g, '')}g`);
  let tier: Hit = null;
  for (let m = g.exec(text); m; m = g.exec(text)) {
    if (m[0] !== '' && !insideEveryday(text, m.index, m[0])) return 'hit';
    if (m[0] !== '') tier = 'soft';
    g.lastIndex = m.index + 1;
  }
  return tier;
}

const best = (a: Hit, b: Hit): Hit => (a === 'hit' || b === 'hit' ? 'hit' : (a ?? b));

const phrases = new Map<string, [RegExp, RegExp]>();
/** The phrase as written, and in STT spelling with its words allowed to run together. */
function phrasePatterns(phrase: string): [RegExp, RegExp] {
  let res = phrases.get(phrase);
  if (!res) {
    const spelled = sttSpelling(phrase).trim().split(/\s+/).map(escape).join('\\s*');
    res = [new RegExp(escape(phrase), 'u'), new RegExp(spelled, 'u')];
    phrases.set(phrase, res);
  }
  return res;
}

/**
 * off: the check as it was. on: onTier. shadow: as off, logging where on
 * differs. If onTier throws, shadow and on log it and return the off reading:
 * the new reading never throws where the old one did not, and never reads less.
 */
function decide(site: string, today: () => boolean, onTier: () => Hit, env: Env): Hit {
  const mode = resolveSafetyWholeWordSites(env);
  const off: Hit = today() ? 'hit' : null;
  if (mode === 'off') return off;
  let on: Hit;
  try {
    on = onTier();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logWouldDiffer({ flag: FLAG, phrase: site, site, error });
    return off;
  }
  if (mode === 'on') return on;
  if (on !== off) logWouldDiffer({ flag: FLAG, phrase: site, site, would: on });
  return off;
}

/** text.toLowerCase().includes(phrase) as 'hit' | null; with the flag on, also 'soft'. */
export function phraseHit(text: string, phrase: string, env: Env = process.env): Hit {
  const lower = text.toLowerCase();
  return decide(
    phrase,
    () => lower.includes(phrase),
    () => {
      const [plain, spelled] = phrasePatterns(phrase);
      return best(tierIn(plain, lower), tierIn(spelled, sttSpelling(text)));
    },
    env
  );
}

/** pattern.test(text) as 'hit' | null; with the flag on, also 'soft'. Coerces as pattern.test does. */
export function patternHit(pattern: RegExp, text: string, env: Env = process.env): Hit {
  return decide(
    pattern.source.slice(0, 60),
    () => pattern.test(text),
    () => {
      const s = String(text);
      return best(tierIn(pattern, s), tierIn(pattern, normalized(s)));
    },
    env
  );
}

/** Whether the phrase counts at all (hit or soft). Never false where the substring check is true. */
export function saysPhrase(text: string, phrase: string, env: Env = process.env): boolean {
  return phraseHit(text, phrase, env) !== null;
}

/** Whether the pattern counts at all (hit or soft). Never false where pattern.test is true. */
export function testWholeWords(pattern: RegExp, text: string, env: Env = process.env): boolean {
  return patternHit(pattern, text, env) !== null;
}

/** The same readers under the names the consumer PRs use. */
export const saysRiskPhrase = saysPhrase;
export const testRiskWords = testWholeWords;

/**
 * off: today's reading. on: the new one. shadow: today's, logging where the
 * new one differs. For a site with its own pattern (crisis-agreement.ts).
 */
export function wholeWordSite(
  site: string,
  today: () => boolean,
  wholeWord: () => boolean,
  env: Env = process.env
): boolean {
  return decide(site, today, () => (wholeWord() ? 'hit' : null), env) !== null;
}
