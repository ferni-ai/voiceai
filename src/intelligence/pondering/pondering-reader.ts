/**
 * What the next call's opener may bring up from the nightly pondering pass:
 * one follow-up that is due, or one "thinking of you" note, each raised once.
 *
 * Phrasing guard: a follow-up is an open check-in, never a "why" about a
 * setback. The dry run produced "Why has your match sparring been limited
 * lately?", which reads as prying; such items are reworded to "how's ...
 * going" when they name the thing, and dropped otherwise.
 *
 * Off unless PONDERING=on.
 *
 * @module intelligence/pondering/pondering-reader
 */
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { isPonderingOn, type PonderFollowUp, type PonderNote } from './pondering.js';

/** Older than this, a pondering result is stale. */
export const MAX_AGE_DAYS = 14;
const DAY_MS = 86_400_000;

/** A "why" question about a setback, which reads as prying. */
const WHY_SETBACK =
  /^\s*why\b.*\b(limited|stopped|quit|can'?t|couldn'?t|haven'?t|hasn'?t|didn'?t|won'?t|failed|lost|injur\w*|hurt|struggl\w*|setback|cancel\w*|behind|missed|skipp\w*|drop\w*)\b/i;

/**
 * The follow-up as an open check-in. A "why" about a setback becomes
 * "how's <thing> going?" when the thing can be named ("your match sparring"),
 * else undefined (dropped).
 */
export function asCheckIn(text: string): string | undefined {
  if (!WHY_SETBACK.test(text)) return /^\s*why\b/i.test(text) ? undefined : text;
  const thing = text.match(
    /\b(?:your|the)\s+((?:[a-z'-]+\s+){0,3}?[a-z'-]+)\s+(?:been|is|was|has|have|had)\b/i
  );
  return thing ? `How's your ${thing[1].replace(/^your\s+/i, '')} going?` : undefined;
}

/** Stable key for an item, so it is raised only once. */
export function surfacedKey(item: { basis: string; text: string }): string {
  return `${item.basis}:${item.text.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 60)}`;
}

export interface GreetingPick {
  followUp?: PonderFollowUp;
  note?: PonderNote;
}

interface StoredPondering {
  followUps?: PonderFollowUp[];
  thinkingOf?: PonderNote[];
  generatedAt?: string;
  surfaced?: string[];
}

function pondering(db: Firestore, userId: string): DocumentReference {
  return db
    .collection('bogle_users')
    .doc(userId)
    .collection('predictive_intelligence')
    .doc('pondering');
}

/** A due, not-yet-raised follow-up (as a check-in), else an unraised note. */
function pick(p: StoredPondering, done: ReadonlySet<string>, today: string): GreetingPick {
  for (const f of p.followUps ?? []) {
    if (done.has(surfacedKey(f)) || (f.when !== undefined && f.when > today)) continue;
    const text = asCheckIn(f.text);
    if (text) return { followUp: { ...f, text } };
  }
  const note = (p.thinkingOf ?? []).find((n) => !done.has(surfacedKey(n)));
  return note ? { note } : {};
}

/**
 * The one item worth raising at the start of this call: a follow-up whose
 * day has come (or that has no day), otherwise a note. Nothing when stale,
 * already raised, or the flag is off.
 */
export async function readPonderingForGreeting(
  db: Firestore,
  userId: string,
  {
    now = new Date(),
    env = process.env,
  }: { now?: Date; env?: Record<string, string | undefined> } = {}
): Promise<GreetingPick> {
  if (!isPonderingOn(env)) return {};
  const doc = await pondering(db, userId).get();
  if (!doc.exists) return {};
  const p = (doc.data() ?? {}) as StoredPondering;
  const generated = p.generatedAt ? Date.parse(p.generatedAt) : NaN;
  if (Number.isNaN(generated) || now.getTime() - generated > MAX_AGE_DAYS * DAY_MS) return {};
  return pick(p, new Set(p.surfaced ?? []), now.toISOString().slice(0, 10));
}

/** Records that an item was raised, so later calls don't repeat it. */
export async function markSurfaced(
  db: Firestore,
  userId: string,
  item: { basis: string; text: string }
): Promise<void> {
  await pondering(db, userId).set(
    { surfaced: FieldValue.arrayUnion(surfacedKey(item)) },
    { merge: true }
  );
}
