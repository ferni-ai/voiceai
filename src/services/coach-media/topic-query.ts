/**
 * What a coaching-resource search may send out: the topic, never the person.
 * Best effort, on one normalized string (NFKC, no zero-width characters, no
 * accents): every name the session knows; emails (also "(at)" spellings),
 * links, @handles, bare domains, dates (numeric and month-name), street
 * addresses, any word with 3+ digits and longer digit runs; "named"/"called"
 * and the word after; after a relation or title ("my son", "dr."), the words
 * that follow unless they are topic words; people, places and organizations an
 * English parser (compromise, already a dependency) finds even in lowercase, a
 * "person" only if the word is a name on its own (so "cancer" stays); every
 * other capitalized word not on a short list of languages and things people
 * learn; then quotes, lowercase, a 12-word cap, and known names once more. The
 * tool description also asks for a generic topic.
 *
 * @module services/coach-media/topic-query
 */

import nlp from 'compromise';

export function coachMediaEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COACH_MEDIA?.trim().toLowerCase() === 'on';
}

/** Longest query sent, in characters and in words. */
export const MAX_QUERY_LENGTH = 120;
export const MAX_QUERY_WORDS = 12;

// The local part may already be gone: a known name is taken first ("seth(at)ferni.ai").
const EMAIL = /(?:[\w.+-]+\s*)?(?:@|\(at\)|\[at\])\s*[\w-]+(?:(?:\.|\(dot\)|\[dot\])[\w-]+)+/giu;
const LINK = /\b(?:[a-z][a-z0-9+.-]*:\/\/|hxxps?:|www\.)\S+/gi;
const HANDLE = /(?<![\p{L}\p{N}])@[\w.]+/gu;
const DOMAIN = /\b[\w-]+(?:\.|\[\.\])[a-z]{2,}\b\S*/gi;
const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE = new RegExp(
  `\\b\\d{1,4}[/.-]\\d{1,2}(?:[/.-]\\d{1,4})?\\b|\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b(?:,?\\s+\\d{2,4})?`,
  'gi'
);
const STREET =
  /\b\d{1,6}\s+(?:[\p{L}]+\s+){1,3}(?:st|street|ave|avenue|rd|road|blvd|ln|lane|dr|drive|ct|court|way|pl|place|ter|hwy)\b\.?(?:\s+(?:apt|unit|suite|#)\s*[\w-]+)?/giu;
// "lives at tampa", "moved to boise": where someone lives, in lowercase.
const LOCATED =
  /\b(live|lives|living|moved|move|based|located|staying)\s+(in|at|to|near|by)\s+(?:[\p{L}'-]+\s*){1,2}/giu;
// Any word holding 3+ digits ("jakeford99" is caught as a handle), and longer digit runs.
// Digits of any script, and any dash, slash, underscore or backslash between them: NFKC
// leaves Arabic-Indic digits and en dashes as they are, and this goes to a search engine.
const DIGITS =
  /(?<![\p{L}\p{N}_])\p{L}*\p{Nd}{3,}[\p{L}\p{Nd}]*(?![\p{L}\p{N}_])|\+?\p{Nd}(?:[\s()/._\\\-\u2010-\u2015\u2212\uFE58\uFE63]*\p{Nd}){4,}/gu;
const QUOTED = /"[^"]*"|“[^”]*”|‘[^’]*’/g;
// "a friend named mike", "a dog called biscuit": the word after is a name; both go,
// so a second pass finds nothing to take.
const NAMED = /\b(?:named|called)\s+[\p{L}'-]+/giu;
// After a relation or title the next words may be a name in any case ("my son
// zephyr", "dr. okonkwo"). They go unless each is a topic word: on TOPIC_WORDS,
// or a word compromise knows that isn't a name on its own ("failing", "has").
// compromise tags an unknown name and an unknown word alike, so an unknown word
// goes too: a dropped rare word is cheap, a leaked name is not. The whole run
// goes, so a second pass finds nothing new.
const RELATIONS = new Set(
  (
    'son daughter wife husband mom mum dad mother father brother sister friend boss coworker ' +
    'co-worker partner girlfriend boyfriend fiance fiancee aunt uncle grandma grandpa grandmother ' +
    'grandfather cousin niece nephew neighbor neighbour roommate kid child stepson stepdaughter ' +
    'mr mrs ms dr prof'
  ).split(' ')
);
const TOPIC_WORDS = new Set(
  (
    'cancer alzheimers dementia parkinsons depression anxiety adhd autism diabetes arthritis ' +
    'asthma copd insomnia migraine migraines chemo chemotherapy surgery therapy rehab recovery ' +
    'knee knees hip hips back neck shoulder ankle wrist spine injury pain stroke heart dialysis ' +
    'pregnancy postpartum menopause addiction alcoholism sobriety ptsd ocd bipolar anorexia ' +
    'bulimia dyslexia grief loss divorce burnout stress loneliness caregiving hospice retirement ' +
    'debt budgeting math reading homework piano guitar spanish french coding school college ' +
    'exams diet weight fitness nutrition sleep'
  ).split(' ')
);
const LEXICON = (nlp.model() as { one: { lexicon: Record<string, unknown> } }).one.lexicon;

const keptAfterRelation = (word: string): boolean =>
  !/\p{L}/u.test(word) ||
  TOPIC_WORDS.has(word) ||
  (Object.prototype.hasOwnProperty.call(LEXICON, word) && !nlp(word).has('#Person'));

/** `text` without the words after a relation or title that may be a name. */
function dropNamesAfterRelations(text: string): string {
  let dropping = false;
  return text
    .split(/\s+/)
    .filter((token) => {
      const word = token
        .toLowerCase()
        .replace(/['’]s$/, '')
        .replace(/[^\p{L}'-]/gu, '');
      if (RELATIONS.has(word)) {
        dropping = true;
        return true;
      }
      if (dropping && !keptAfterRelation(word)) return false;
      dropping = false;
      return true;
    })
    .join(' ');
}

// Capitalized words are dropped unless they are one of these.
const KEPT_PROPER = new Set(
  (
    'spanish french german italian portuguese japanese chinese mandarin cantonese korean arabic ' +
    'hindi russian english latin greek hebrew dutch swedish polish turkish vietnamese thai asl ' +
    'python javascript java excel sql react swift kotlin rust photoshop figma canva notion linux ' +
    'windows bible yoga pilates adhd cbt dbt hiit ibs ptsd ocd acl tmj'
  ).split(' ')
);
const CAPITALIZED = /(?<![\p{L}\p{N}])\p{Lu}[\p{L}'’-]*/gu;

/** Every name the session knows for this caller: theirs, their family's, their city. */
export function sessionIdentifiers(userData: Record<string, unknown>): string[] {
  const profile = ((userData.services as { userProfile?: unknown } | undefined)?.userProfile ??
    {}) as {
    name?: unknown;
    preferredName?: unknown;
    onboarding?: { userName?: unknown };
    familyMembers?: Array<{ name?: unknown }>;
    location?: { city?: unknown };
  };
  return [
    userData.name,
    userData.userName,
    userData.preferredName,
    profile.name,
    profile.preferredName,
    profile.onboarding?.userName,
    profile.location?.city,
    ...(Array.isArray(profile.familyMembers) ? profile.familyMembers.map((f) => f?.name) : []),
  ].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** NFKC, zero-width characters out, accents off: the one form every check sees. */
function normalized(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}+/gu, '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC');
}

/** `text` without any word of the caller's known names (whole word, possessive, any case). */
function stripIdentifiers(text: string, identifiers: Array<string | undefined>): string {
  const words = identifiers
    .flatMap((id) => normalized(id ?? '').split(/[\s,]+/))
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ''))
    .filter((w) => w.length >= 2);
  let out = text;
  for (const word of words) {
    out = out.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?:'s)?(?![\\p{L}\\p{N}])`, 'giu'),
      ' '
    );
  }
  return out;
}

/**
 * People, places and organizations compromise finds, lowercase ones too. A word
 * it calls a person only in context ("bob retirement") stays unless it is a
 * name on its own, so topic words ("cancer", "knee") never go.
 */
function stripEntities(text: string): string {
  const drop = nlp(text)
    .terms()
    .json()
    .flatMap((t: { text: string; terms: Array<{ tags: string[] }> }) => {
      const tags = t.terms[0]?.tags ?? [];
      const entity = tags.includes('Place') || tags.includes('Organization');
      const person = tags.includes('Person') && nlp(t.text).has('#Person');
      return entity || person ? [t.text] : [];
    });
  return stripIdentifiers(text, drop);
}

/**
 * `topic` as a search query, or null when nothing is left. Every step runs on
 * the normalized string, in an order where none can re-expose what an earlier
 * one passed; known names are stripped again on the final string. Running it
 * on its own output changes nothing.
 */
export function topicOnlyQuery(
  topic: string,
  identifiers: Array<string | undefined>
): string | null {
  const patterns = stripIdentifiers(normalized(topic), identifiers)
    .replace(EMAIL, ' ')
    .replace(LINK, ' ')
    .replace(HANDLE, ' ')
    .replace(DOMAIN, ' ')
    .replace(STREET, ' ')
    .replace(LOCATED, '$1 $2 ')
    .replace(DATE, ' ')
    .replace(DIGITS, ' ')
    .replace(NAMED, ' ');
  let query = stripEntities(dropNamesAfterRelations(patterns))
    .replace(CAPITALIZED, (w: string) =>
      KEPT_PROPER.has(w.replace(/['’]s$/, '').toLowerCase()) ? w : ' '
    )
    .replace(QUOTED, ' ')
    .replace(/["“”‘’<>`{}[\]\\|()]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .slice(0, MAX_QUERY_WORDS)
    .join(' ');
  if (query.length > MAX_QUERY_LENGTH) query = query.slice(0, MAX_QUERY_LENGTH).trimEnd();
  query = stripIdentifiers(query, identifiers).replace(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(query) ? query : null;
}
