/**
 * Home (spec §5.4.2, §8 rule 7), pure: saved home, then a GPS or typed profile city, then the
 * home fact; never an IP, zone or device city. A value that isn't a plain place name of at most
 * 4 words (digits, line breaks, markup, contact data) is refused and the next source is tried.
 *
 * @module agents/multi-agent/caller-card/place
 */
import { hasContactData, oneLine } from '../../../intelligence/person-model/index.js';
import type { HomePlace } from './types.js';

const PRECISE = new Set(['browser-gps', 'manual']);
const MAX_PLACE_CHARS = 60;
const MAX_WORDS = 4; // a town and its region, e.g. "Maple d'Lake", "Lakeview, M.W."
const BREAK = /[\p{Cc}\p{Zl}\p{Zp}]/u; // a newline, tab or line separator: text, not a place
const WORD = /^[\p{L}\p{M}][\p{L}\p{M}'\u2019.-]*,?$/u; // starts with a letter; ' - . inside, , at the end

function placeName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed || BREAK.test(trimmed)) return null;
  const s = oneLine(trimmed).replace(/[\s.,;:]+$/, '');
  const words = s.normalize('NFKC').split(' ');
  if (!s || s.length > MAX_PLACE_CHARS || words.length > MAX_WORDS) return null;
  return words.every((w) => WORD.test(w)) && !hasContactData(s) ? s : null;
}

export function choosePlace(c: {
  prefs?: string | null;
  profile?: { value: string; source: string } | null;
  fact?: string | null;
}): HomePlace | null {
  const tries: Array<[HomePlace['source'], string | null | undefined]> = [
    ['preferences', c.prefs],
    ['profile', c.profile && PRECISE.has(c.profile.source) ? c.profile.value : null],
    ['fact', c.fact],
  ];
  for (const [source, raw] of tries) {
    const place = placeName(raw);
    if (place) return { place, source };
  }
  return null;
}
