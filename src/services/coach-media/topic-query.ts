/**
 * What a coaching-resource search may send out: the topic, never the person.
 *
 * The model is told to pass a topic ("beginner shin splint stretches"), but it
 * hears names, numbers and emails all call long, so the query is scrubbed here
 * before it leaves: every name the session knows (the caller's first and last
 * name, family members, their city), quoted strings, emails, links and digit
 * runs (phone, account or card numbers) are removed, and so is a capitalized
 * word after "at", "in", "with" and the like ("at Mayo", "with Dana"), which
 * is how places, employers and people the session doesn't know show up. The
 * query is lowercased and capped at 12 words. Health details can't be told
 * apart from a topic by pattern; the tool description asks for a generic topic.
 *
 * Behind COACH_MEDIA=on.
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
// Five or more digits, allowing separators: phone, account, card or member numbers.
const DIGIT_RUN = /\+?\d(?:[\s().-]*\d){4,}/g;

const QUOTED = /"[^"]*"|“[^”]*”|‘[^’]*’/g;
// A Titlecase word after a preposition: a place, employer or person ("at Mayo",
// "with Dana"). Language and nationality words ("in Spanish") are kept.
const PROPER_AFTER_PREPOSITION =
  /\b(at|in|from|with|near|for|by)\s+(?!\p{Lu}\p{Ll}*(?:ish|ese|ian|an|ic|ch)\b)\p{Lu}\p{Ll}+(?:'s)?/gu;

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

/**
 * `topic` with the caller's identifiers removed, or null when nothing is left.
 * `identifiers` are the caller's known names (full name, first name, nickname);
 * each word of each is removed wherever it stands as a whole word.
 */
export function topicOnlyQuery(
  topic: string,
  identifiers: Array<string | undefined>
): string | null {
  let query = topic
    .normalize('NFKC')
    .replace(QUOTED, ' ')
    .replace(EMAIL, ' ')
    .replace(LINK, ' ')
    .replace(DIGIT_RUN, ' ');
  const words = identifiers
    .flatMap((id) => (id ?? '').split(/[\s,]+/))
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ''))
    .filter((w) => w.length >= 2);
  for (const word of words) {
    query = query.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?:'s)?(?![\\p{L}\\p{N}])`, 'giu'),
      ' '
    );
  }
  query = query
    .replace(PROPER_AFTER_PREPOSITION, '$1')
    .replace(/["“”‘’<>`{}[\]\\|]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_QUERY_WORDS)
    .join(' ');
  if (query.length > MAX_QUERY_LENGTH) query = query.slice(0, MAX_QUERY_LENGTH).trimEnd();
  return /[\p{L}\p{N}]/u.test(query) ? query : null;
}
