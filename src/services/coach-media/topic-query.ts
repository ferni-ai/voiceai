/**
 * What a coaching-resource search may send out: the topic, never the person.
 * Best effort, on one normalized string (NFKC, no zero-width characters, no
 * accents): every name the session knows; emails (also "(at)" spellings),
 * links, @handles, bare domains, dates (numeric and month-name), street
 * addresses, any word with 3+ digits and longer digit runs; the word after
 * "named"/"called" or a relation or title ("my son jake", "dr smith"); people,
 * places and organizations an English parser (compromise, already a
 * dependency) finds even in lowercase; every other capitalized word not on a
 * short list of languages and things people learn; then quotes, lowercase,
 * a 12-word cap, and known names once more. The tool description also asks
 * for a generic topic.
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

const EMAIL = /[\w.+-]+\s*(?:@|\(at\)|\[at\])\s*[\w-]+(?:(?:\.|\(dot\)|\[dot\])[\w-]+)+/giu;
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
const DIGITS = /\b[\p{L}]*\d{3,}[\p{L}\d]*\b|\+?\d(?:[\s()/.-]*\d){4,}/gu;
const QUOTED = /"[^"]*"|“[^”]*”|‘[^’]*’/g;
// "a friend named mike", "my son jake", "dr. smith": the next word may be a
// lowercase name, unless it is one of the little words that usually follow.
const NAMED =
  /\b(named|called|son|daughter|wife|husband|mom|mum|dad|mother|father|brother|sister|friend|boss|coworker|co-worker|partner|girlfriend|boyfriend|aunt|uncle|grandma|grandpa|cousin|niece|nephew|mr|mrs|ms|dr)\.?\s+(?!(?:named|called|is|was|are|were|has|had|have|says|said|told|thinks|wants|keeps|asked|suggested|recommended|and|or|but|to|for|with|at|in|on|of|about|who|that|always|never|just|really|and|the|a|an|my|our|his|her|their)\b)[\p{L}'-]+/giu;
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

/** People, places and organizations compromise finds, lowercase ones too. */
function stripEntities(text: string): string {
  const doc = nlp(text);
  doc.match('(#Person|#Place|#Organization)').replaceWith(' ');
  return doc.text();
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
    .replace(NAMED, '$1 ');
  let query = stripEntities(patterns)
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
