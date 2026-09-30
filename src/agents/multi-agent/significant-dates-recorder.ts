/**
 * Remembers the dates that matter to the caller, and knows when one is near.
 *
 * At call start the caller's dates are loaded and matched against their own
 * calendar (see memory/recall/significant-dates.ts): a birthday, anniversary
 * or the day they lost someone that falls today, tomorrow or yesterday
 * becomes userData.daysThatMatter, which the greeting and the per-reply hook
 * read. During the call, a date the caller mentions with its day is saved.
 *
 * Only committed user turns are read (not interim transcripts), so one
 * sentence saves once.
 *
 * @module agents/multi-agent/significant-dates-recorder
 */

import {
  datesNear,
  detectSignificantDate,
  formatDatesNear,
  type SignificantDate,
} from '../../memory/recall/significant-dates.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SignificantDates' });

const COLLECTION = 'significant_dates';
const MAX_DATES = 100;

interface DatesHolder {
  timezone?: string;
  daysThatMatter?: string | null;
}

interface SessionEvents {
  on?: (event: string, handler: (event: unknown) => void) => void;
  off?: (event: string, handler: (event: unknown) => void) => void;
}

export interface SignificantDatesRecorderDeps {
  userData: DatesHolder;
  save?: (date: SignificantDate) => void;
  now?: () => Date;
}

export function createSignificantDatesRecorder(deps: SignificantDatesRecorderDeps) {
  const now = deps.now ?? (() => new Date());
  const known = new Set<string>();
  return {
    /** The caller's stored dates: note any that are near. */
    loaded(dates: readonly SignificantDate[]): void {
      for (const d of dates) known.add(d.id);
      const at = now();
      const near = datesNear(dates, at, deps.userData.timezone);
      deps.userData.daysThatMatter = formatDatesNear(near, at);
      if (near.length > 0) {
        log.info({ near: near.map((n) => `${n.date.kind}:${n.when}`) }, 'A day that matters');
      }
    },
    /** A committed user turn. */
    heard(text: string): void {
      const date = detectSignificantDate(text, now(), deps.userData.timezone);
      if (!date || known.has(date.id)) return;
      known.add(date.id);
      deps.save?.(date);
      log.info({ kind: date.kind }, 'Date that matters saved');
    },
  };
}

/** Feed the recorder from committed user turns. Returns the unsubscribe. */
export function wireSignificantDatesRecorder(
  session: SessionEvents,
  recorder: ReturnType<typeof createSignificantDatesRecorder>
): () => void {
  const onItem = (event: unknown) => {
    const item = (event as { item?: { type?: string; role?: string; textContent?: string } })?.item;
    if (item?.role === 'user' && item.textContent) recorder.heard(item.textContent);
  };
  session.on?.('conversation_item_added', onItem);
  return () => session.off?.('conversation_item_added', onItem);
}

function fromStored(id: string, doc: Record<string, unknown>): SignificantDate | null {
  const { kind, who, month, day, year } = doc;
  if (kind !== 'birthday' && kind !== 'anniversary' && kind !== 'loss') return null;
  if (typeof month !== 'number' || typeof day !== 'number') return null;
  return {
    id,
    kind,
    who: typeof who === 'string' ? who : 'self',
    month,
    day,
    ...(typeof year === 'number' ? { year } : {}),
  };
}

/** The caller's saved dates. Never throws. */
export async function loadSignificantDates(userId: string): Promise<SignificantDate[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .limit(MAX_DATES)
      .get();
    return snap.docs
      .map((d) => fromStored(d.id, d.data()))
      .filter((d): d is SignificantDate => d !== null);
  } catch (error) {
    log.warn({ error: String(error) }, 'Significant dates not loaded');
    return [];
  }
}

/** Save a date that matters. Never throws. */
export async function saveSignificantDate(userId: string, date: SignificantDate): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    const { id, ...fields } = date;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc(id)
      .set({ ...fields, savedAt: Date.now() }, { merge: true });
  } catch (error) {
    log.warn({ error: String(error) }, 'Significant date not saved');
  }
}
