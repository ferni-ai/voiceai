/**
 * The summary filter for returning-caller.ts: one short line from a call
 * summary's topics, keeping only topics that clearly carry no age, place,
 * number, person's name, or health, faith, money, legal or contact detail,
 * and a first name in a plain shape. Pure.
 *
 * @module services/identity/returning-caller-summary
 */

export const MAX_SUMMARY_CHARS = 280;

const NAME = /^\p{Lu}\p{Ll}{1,29}(?:-\p{Lu}\p{Ll}{1,29})?$/u;
export const safeFirstName = (name: string | undefined): string | undefined =>
  name && NAME.test(name) ? name : undefined;

/** Stems that can make a topic sensitive (health, faith, place, age, money, law); any ending. */
const SENSITIVE_STEMS =
  'surger diagnos therap medic medicat pregnan depress suicid injur addict alcohol prescription ' +
  'diabet autis bipolar funeral relig synagogue christian muslim catholic buddhis atheis apartment ' +
  'neighborhood neighbourhood hometown birthday teen lesbian sexual politic democrat republican ' +
  'immigra lawyer arrest bankrupt mortgage salar';
/** Whole words (and their plurals) that can make a topic sensitive, or carry contact details. */
const SENSITIVE_WORDS =
  'health doctor hospital sick ill illness cancer mental disorder disease pain rehab drunk drinking ' +
  'drug pill clinic covid adhd anxiety anxious panic grief died death dead church god pray prayer ' +
  'praying faith mosque temple bible quran koran jesus allah jewish hindu mormon live lives living ' +
  'lived moved moving move address street city town state country near zip age aged year years old ' +
  'turning kid school grade gay trans sex vote election visa court police prison jail debt bank ' +
  'loan money rent phone number email self-harm';
const SENSITIVE = new RegExp(
  String.raw`\b(?:(?:${SENSITIVE_STEMS.split(' ').join('|')})\w*|(?:${SENSITIVE_WORDS.split(' ').join('|')})s?)\b|\b(?:call|text) me\b`,
  'i'
);
/** The summarizer calls the caller USER (caller-assertions.ts SPEAKER_RULE). */
const SPEAKER = /^(?:the\s+)?user(?:['’]s)?$/i;

/** Words the caller said capitalised mid-sentence: names and places, by how they were spoken. */
export function properNounsIn(callerLines: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const line of callerLines) {
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const words = sentence.trim().split(/\s+/).slice(1);
      for (const w of words) {
        const bare = w.replace(/[^\p{L}'’-]/gu, '').replace(/['’]s$/, '');
        if (/^\p{Lu}\p{Ll}/u.test(bare) && bare !== 'I') found.add(bare.toLowerCase());
      }
    }
  }
  return found;
}

/** A topic kept only if nothing in it could be an age, place, number, name or sensitive detail. */
function safeTopic(topic: string, properNouns: Set<string>): string | null {
  const one = topic.replace(/\s+/g, ' ').trim();
  if (!one || /[\d@/:#]|https?/i.test(one) || SENSITIVE.test(one)) return null;
  const words = one.split(' ').filter((w) => !SPEAKER.test(w));
  if (words.length === 0) return null;
  for (const [i, raw] of words.entries()) {
    const bare = raw.replace(/[^\p{L}'’-]/gu, '').replace(/['’]s$/, '');
    if (!bare || properNouns.has(bare.toLowerCase())) return null;
    if (i > 0 && /^\p{Lu}/u.test(bare)) return null; // a name or a place
    if (/['’]s$/.test(raw.replace(/[^\p{L}'’]/gu, ''))) return null; // "Sam's wedding"
  }
  const line = words.join(' ').replace(/[.;,]+$/, '');
  return line.charAt(0).toLowerCase() + line.slice(1);
}

/**
 * One short line from the call summary's topics, or undefined when no topic
 * is clearly safe. `callerLines` are the caller's own words, to spot proper nouns.
 */
export function safeSummary(
  topics: readonly unknown[] | undefined,
  callerLines: readonly string[] = []
): string | undefined {
  const nouns = properNounsIn(callerLines);
  const kept = (topics ?? [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => safeTopic(t, nouns))
    .filter((t): t is string => !!t)
    .slice(0, 2);
  const line = kept.join(' and ').slice(0, MAX_SUMMARY_CHARS).trim();
  return line || undefined;
}
