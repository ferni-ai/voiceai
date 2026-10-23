/**
 * Texts to a member that a guard holds for later (quiet hours, a Focus), kept in
 * feature_held_texts and released by the reminder job (every minute). A held
 * text is sent once it's due, or dropped with a logged reason (stale, STOP,
 * texts off); never lost silently.
 *
 * @module services/outreach/held-texts
 */
import { createLogger } from '../../utils/safe-logger.js';
import { checkinDb } from './checkin-replies.js';
import { waitsAtRelease } from './focus-send-hold.js';
import {
  defaultTextDeps,
  sendGuardedText,
  type GuardedText,
  type TextDeps,
} from './guarded-text.js';

const log = createLogger({ module: 'held-texts' });
const HELD_TEXTS = 'feature_held_texts';
/** Released this long after its time, a held text is stale: dropped, never sent as a backlog. */
export const HELD_STALE_MS = 24 * 60 * 60 * 1000;

export interface HeldText {
  id: string;
  text: GuardedText;
  /** ISO time it may go. */
  releaseAt: string;
  reason: string;
}

export interface HeldTextStore {
  /** With `id`, that doc is written (a second hold of the same text rewrites it). */
  add: (held: Omit<HeldText, 'id'>, id?: string) => Promise<void>;
  due: (now: Date, limit: number) => Promise<HeldText[]>;
  remove: (id: string) => Promise<void>;
}

export const firestoreHeldTexts: HeldTextStore = {
  async add(held, id) {
    const texts = checkinDb().collection(HELD_TEXTS);
    await (id === undefined ? texts.add(held) : texts.doc(id).set(held));
  },
  async due(now, limit) {
    const snap = await checkinDb()
      .collection(HELD_TEXTS)
      .where('releaseAt', '<=', now.toISOString())
      .limit(limit)
      .get();
    return snap.docs.map((d) => ({ ...(d.data() as Omit<HeldText, 'id'>), id: d.id }));
  },
  async remove(id) {
    await checkinDb().collection(HELD_TEXTS).doc(id).delete();
  },
};

/** Holds `t` until `releaseAt` (hold-until-window), logging why; `id` keeps one copy per text. */
export async function holdText(
  t: GuardedText,
  releaseAt: Date,
  reason: string,
  store: HeldTextStore = firestoreHeldTexts,
  id?: string
): Promise<void> {
  const held = { text: t, releaseAt: releaseAt.toISOString(), reason };
  await (id === undefined ? store.add(held) : store.add(held, id));
  log.info({ kind: t.kind, refId: t.refId, reason, releaseAt }, 'Text held');
}

const RETRY: ReadonlySet<string> = new Set([
  'recently-sent',
  'consent-unknown',
  'paused',
  'focus-held',
]);

/**
 * Sends the held texts that are due. A gap, consent-unknown, pause, a Focus still holding it or
 * (for one a Focus held) quiet hours: it waits. Any other skip ends it. A Focus-held text whose kind went out since (a gap) ends too:
 * it reached them another way.
 */
export async function releaseHeldTexts(
  store: HeldTextStore = firestoreHeldTexts,
  deps: TextDeps = defaultTextDeps(),
  send: typeof sendGuardedText = sendGuardedText
): Promise<{ sent: number; dropped: number; waiting: number }> {
  const now = deps.now();
  const out = { sent: 0, dropped: 0, waiting: 0 };
  for (const held of await store.due(now, 50)) {
    const ctx = { kind: held.text.kind, refId: held.text.refId, heldFor: held.reason };
    if (now.getTime() - Date.parse(held.releaseAt) > HELD_STALE_MS) {
      log.warn({ ...ctx, reason: 'stale' }, 'Held text dropped');
      await store.remove(held.id);
      out.dropped++;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    if (await waitsAtRelease(held, deps.store, now, deps.focus)) {
      out.waiting++;
      continue;
    }
    const outcome = await send(held.text, deps); // eslint-disable-line no-await-in-loop
    const sentSince =
      held.reason === 'focus' && !outcome.sent && outcome.reason === 'recently-sent';
    // A gap, an unreadable consent record, a pause or a Focus: try again on a later run.
    if (!outcome.sent && RETRY.has(outcome.reason) && !sentSince) {
      out.waiting++;
      continue;
    }
    if (!outcome.sent) log.warn({ ...ctx, reason: outcome.reason }, 'Held text dropped');
    await store.remove(held.id);
    out[outcome.sent ? 'sent' : 'dropped']++;
  }
  return out;
}
