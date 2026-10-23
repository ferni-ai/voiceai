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

/**
 * Structural fields, at any depth, never filtered: ids, time zones, locales
 * and languages. They say how to reach or address the caller, not what they
 * said: "America/New_York" is not about a forgotten "New York".
 */
export function isStructuralKey(key: string): boolean {
  return (
    /^ids?$/i.test(key) ||
    /[a-z0-9](?:Id|Ids|ID)$/.test(key) ||
    /_ids?$/i.test(key) ||
    /time_?zone|^tz$|locale|^lang(?:uage)?s?$/i.test(key)
  );
}

const MAX_DEPTH = 6;

/** Every string in a value, joined: what a list item is about, read whole. */
function allText(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value;
  if (depth >= MAX_DEPTH || !value || typeof value !== 'object') return '';
  const parts = Array.isArray(value)
    ? value
    : Object.entries(value)
        .filter(([k]) => !isStructuralKey(k))
        .map(([, v]) => v);
  return parts
    .map((v) => allText(v, depth + 1))
    .filter(Boolean)
    .join(' ');
}

/** A literal object; class instances (a state manager, a Date, a Firestore Timestamp) pass whole. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * The value with what is about a forgotten topic left out; undefined when all
 * of it is. Unchanged values come back as the same reference, so a reader
 * that writes into them still writes into the real object.
 */
export function scrub(value: unknown, forgotten: ForgottenCheck, depth = 1): unknown {
  if (typeof value === 'string') return forgotten(value) ? undefined : value;
  if (depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    const kept = value.filter((item) => !forgotten(allText(item)));
    return kept.length === value.length ? value : kept;
  }
  if (!isPlainObject(value)) return value;
  return scrubFields(value, forgotten, new Set(), depth + 1);
}

/** Every field of `obj` scrubbed but those in `pass`; `obj` itself when nothing changed. */
export function scrubFields<T extends object>(
  obj: T,
  forgotten: ForgottenCheck,
  pass: ReadonlySet<string>,
  depth = 1
): T {
  const out: Record<string, unknown> = {};
  let changed = false;
  for (const [k, v] of Object.entries(obj)) {
    const kept = pass.has(k) || isStructuralKey(k) ? v : scrub(v, forgotten, depth);
    if (kept !== v) changed = true;
    if (kept !== undefined) out[k] = kept;
  }
  return changed ? (out as T) : obj;
}

/** The profile, filtered by `forgotten` (see the module doc); the same object when nothing is. */
export function scrubProfile<P extends object>(profile: P, forgotten: ForgottenCheck): P {
  return scrubFields(profile, forgotten, PROFILE_PASS_THROUGH);
}
