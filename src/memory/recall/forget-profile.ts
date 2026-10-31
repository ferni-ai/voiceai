/**
 * The caller's profile as a prompt reads it, with what they asked to forget
 * left out (FORGET_EVERY_READER: forget-every-reader.ts profileForCaller).
 *
 * An allowlist, not a denylist: every field is filtered except the few in
 * PROFILE_PASS_THROUGH (identity, contact and routing, and fixed-vocabulary
 * settings), so a free-text field added to the profile later is filtered
 * from the day it lands. Filtering walks the value: a string about a
 * forgotten topic is dropped; a list loses every item with any text about
 * one (a key moment, a summary, a life event: whole, never left half-empty
 * for a reader to trip on); an object is walked field by field; numbers,
 * booleans and dates pass. The stored profile is never changed.
 *
 * @module memory/recall/forget-profile
 */
/** True when a text is about something the caller asked to forget. */
type ForgottenCheck = (text: string) => boolean;

/**
 * Profile fields that pass unfiltered: who the caller is and how to reach
 * them, and settings from a fixed vocabulary. Everything else is filtered.
 */
export const PROFILE_PASS_THROUGH: ReadonlySet<string> = new Set([
  'id',
  'userId',
  'name',
  'preferredName',
  'linkedIdentifiers',
  'voiceSketch',
  'onboarding',
  'contactInfo',
  'location',
  'relationshipStage',
  'communicationStyle',
  'speakingPace',
  'humorAppreciation',
  'investmentExperience',
  'lifeStage',
  'riskProfile',
  'currentSessionId',
  'currentEnergyLevel',
]);

const MAX_DEPTH = 6;

/** Every string in a value, joined: what a list item is about, read whole. */
function allText(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value;
  if (depth >= MAX_DEPTH || !value || typeof value !== 'object') return '';
  const parts = Array.isArray(value) ? value : Object.values(value);
  return parts
    .map((v) => allText(v, depth + 1))
    .filter(Boolean)
    .join(' ');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || v instanceof Date) return false;
  return typeof (v as { toDate?: unknown }).toDate !== 'function'; // a Firestore Timestamp passes
}

/** The value with what is about a forgotten topic left out; undefined when all of it is. */
function scrub(value: unknown, forgotten: ForgottenCheck, depth: number): unknown {
  if (typeof value === 'string') return forgotten(value) ? undefined : value;
  if (depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    return value.filter((item) => !forgotten(allText(item)));
  }
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const kept = scrub(v, forgotten, depth + 1);
    if (kept !== undefined) out[k] = kept;
  }
  return out;
}

/** The profile, filtered by `forgotten` (see the module doc); a new object. */
export function scrubProfile<P extends object>(profile: P, forgotten: ForgottenCheck): P {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(profile)) {
    const kept = PROFILE_PASS_THROUGH.has(k) ? v : scrub(v, forgotten, 1);
    if (kept !== undefined) out[k] = kept;
  }
  return out as P;
}
