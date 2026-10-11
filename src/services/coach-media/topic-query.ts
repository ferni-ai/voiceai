/**
 * What a coaching-resource search may send out: the topic, never the person.
 *
 * The model is told to pass a topic ("beginner shin splint stretches"), but it
 * hears names, numbers and emails all call long, so the query is scrubbed here
 * before it leaves: the caller's own name, emails, links and digit runs (phone,
 * account or card numbers) are removed. Health or money details can't be told
 * apart from a topic by pattern; the tool description asks for the topic only.
 *
 * Behind COACH_MEDIA=on.
 *
 * @module services/coach-media/topic-query
 */

export function coachMediaEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COACH_MEDIA?.trim().toLowerCase() === 'on';
}

/** Longest query sent, in characters. */
export const MAX_QUERY_LENGTH = 120;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
// Five or more digits, allowing separators: phone, account, card or member numbers.
const DIGIT_RUN = /\+?\d(?:[\s().-]*\d){4,}/g;

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
    .replace(/[<>`{}[\]\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (query.length > MAX_QUERY_LENGTH) query = query.slice(0, MAX_QUERY_LENGTH).trimEnd();
  return /[\p{L}\p{N}]/u.test(query) ? query : null;
}
