/**
 * What a coaching-resource search may send out: the topic, never the person.
 * Best effort: the model writes the topic and hears names all call long, so
 * before the query leaves, every name the session knows, every other
 * capitalized word (people, places and employers it doesn't know) except
 * languages and a few things people learn, the word after "named"/"called",
 * quoted strings, emails, links, dates and digit runs are removed; it is then
 * lowercased and capped at 12 words. Health details can't be told from a topic
 * by pattern, so the tool description also asks for a generic, lowercase topic.
 *
 * @module services/coach-media/topic-query
 */

export function coachMediaEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COACH_MEDIA?.trim().toLowerCase() === 'on';
}

/** Longest query sent, in characters and in words. */
export const MAX_QUERY_LENGTH = 120;
export const MAX_QUERY_WORDS = 12;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const DATE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/g;
// Five or more digits, allowing separators: phone, account, card or member numbers.
const DIGIT_RUN = /\+?\d(?:[\s()/.-]*\d){4,}/g;
const QUOTED = /"[^"]*"|“[^”]*”|‘[^’]*’/g;
// "a friend named mike": the name may be lowercase.
const NAMED = /\b(named|called)\s+[\p{L}'-]+/giu;
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

/** `text` without any word of the caller's known names (whole word, possessive, any case). */
function stripIdentifiers(text: string, identifiers: Array<string | undefined>): string {
  const words = identifiers
    .flatMap((id) => (id ?? '').normalize('NFKC').split(/[\s,]+/))
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
 * `topic` as a search query, or null when nothing is left. One NFKC string,
 * in an order where no step can re-expose what an earlier one passed: known
 * names, then emails/links/dates/numbers, then every capitalized word not on
 * the list (before lowercasing hides it), then quotes, lowercase and the cap,
 * and known names once more on the final string. Running it twice changes nothing.
 */
export function topicOnlyQuery(
  topic: string,
  identifiers: Array<string | undefined>
): string | null {
  let query = stripIdentifiers(topic.normalize('NFKC'), identifiers)
    .replace(EMAIL, ' ')
    .replace(LINK, ' ')
    .replace(DATE, ' ')
    .replace(DIGIT_RUN, ' ')
    .replace(NAMED, ' ')
    .replace(CAPITALIZED, (w: string) =>
      KEPT_PROPER.has(w.replace(/['’]s$/, '').toLowerCase()) ? w : ' '
    )
    .replace(QUOTED, ' ')
    .replace(/["“”‘’<>`{}[\]\\|]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_QUERY_WORDS)
    .join(' ');
  if (query.length > MAX_QUERY_LENGTH) query = query.slice(0, MAX_QUERY_LENGTH).trimEnd();
  query = stripIdentifiers(query, identifiers).replace(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(query) ? query : null;
}
