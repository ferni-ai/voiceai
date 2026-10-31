/**
 * Home: one place, from stated or precise sources only (spec §5.4.2, §8 rule 7). Pure. Order:
 * saved home, then a profile city from browser GPS or typed in, then the newest home fact. An
 * IP, time-zone or language city is never Home (the device city never reaches here). A value
 * with a digit (street, flat, ZIP), markup or contact data is refused and the next is tried.
 *
 * @module agents/multi-agent/caller-card/place
 */
import { hasContactData, oneLine } from '../../../intelligence/person-model/index.js';
import type { HomePlace } from './types.js';

const PRECISE = new Set(['browser-gps', 'manual']);
const MAX_PLACE_CHARS = 60;
const PLACE_CHARS = /^[\p{L}\p{M}' .,-]+$/u; // letters and name punctuation: no digit or markup

function placeName(raw: string | null | undefined): string | null {
  const s = oneLine(raw ?? '').replace(/[\s.,;:]+$/, '');
  if (!s || s.length > MAX_PLACE_CHARS || !PLACE_CHARS.test(s.normalize('NFKC'))) return null;
  return hasContactData(s) ? null : s;
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
