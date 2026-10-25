/**
 * Firestore store for follow-ups: bogle_users/{uid}/follow_through/{id}.
 *
 * Implements the follow-through context's FollowUpStore port
 * (services/follow-through/ports.ts). The rules for a follow-up's life live in
 * that context; this only saves and finds.
 *
 * - A follow-up's id comes from its source ("reminders" + the reminder's id),
 *   so importing the same reminder twice finds the first one instead of
 *   making a second.
 * - save() writes only if the stored copy still has the updatedAt the caller
 *   read, so a call and the delivery job can't undo each other.
 * - Reads drop documents that don't look like a follow-up (logged) rather
 *   than handing half a record to the rules.
 *
 * @module services/stores/follow-through-store
 */

import { createHash } from 'crypto';
import type { CollectionReference, Firestore } from '@google-cloud/firestore';
import {
  ask,
  type FollowUp,
  type FollowUpAction,
  type FollowUpAsker,
  type FollowUpKind,
  type FollowUpStatus,
  type FollowUpStore,
  type NewFollowUp,
  type Repeat,
  type SurfacedVia,
} from '../follow-through/index.js';
import { brainFieldsOf } from './follow-through-brain-fields.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'follow-through-store' });

const KINDS: ReadonlySet<string> = new Set([
  'reminder',
  'commitment',
  'promise',
  'thread',
  'date',
  'dose',
]);
const STATUSES: ReadonlySet<string> = new Set(['open', 'surfaced', 'done', 'released', 'expired']);
const LIVE: FollowUpStatus[] = ['open', 'surfaced'];

/** Same source, same id: an import can run twice without making two. */
export function followUpId(source: { store: string; ref: string }): string {
  return createHash('sha256').update(`${source.store}:${source.ref}`).digest('hex').slice(0, 24);
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

function repeatOf(x: unknown): Repeat | null {
  if (!isRecord(x)) return null;
  const every = str(x.every);
  const at = str(x.at);
  return (every === 'day' || every === 'week' || every === 'year') && at && /^\d{2}:\d{2}$/.test(at)
    ? { every, at }
    : null;
}

const OUTCOMES: ReadonlySet<string> = new Set(['sent', 'failed', 'unknown']);

/** A read-back action (outreach-confirm), keeping only the fields it may have. */
function actionOf(x: unknown): FollowUpAction | null {
  if (!isRecord(x) || !str(x.tool)) return null;
  const contactId = str(x.contactId);
  return {
    tool: String(x.tool),
    ...(contactId ? { contactId } : {}),
    ...(x.waitingOn === 'you' ? { waitingOn: 'you' as const } : {}),
    ...(OUTCOMES.has(String(x.outcome))
      ? { outcome: x.outcome as NonNullable<FollowUpAction['outcome']> }
      : {}),
  };
}

/** Every field a follow-up needs is present and has the right kind of value. */
function hasFollowUpShape(data: Record<string, unknown>): boolean {
  const source = isRecord(data.source) ? data.source : null;
  const strings = [
    data.userId,
    data.text,
    data.zone,
    data.createdAt,
    data.updatedAt,
    source?.store,
    source?.ref,
  ];
  return (
    strings.every((x) => str(x) !== undefined) &&
    KINDS.has(String(data.kind)) &&
    STATUSES.has(String(data.status))
  );
}

/** A stored document as a follow-up, or null if it isn't one. */
export function toFollowUp(id: string, data: unknown): FollowUp | null {
  if (!isRecord(data) || !hasFollowUpShape(data)) return null;
  const { userId, kind, text, zone, status, createdAt, updatedAt } = data;
  const source = data.source as Record<string, unknown>;
  const action = actionOf(data.action);
  const surfaced = Array.isArray(data.surfaced)
    ? data.surfaced.flatMap((s) => {
        if (!isRecord(s) || !str(s.at) || !['opener', 'in-call', 'text'].includes(String(s.via)))
          return [];
        return [{ at: String(s.at), via: s.via as SurfacedVia }];
      })
    : [];
  return {
    id,
    userId: String(userId),
    kind: kind as FollowUpKind,
    text: String(text),
    dueAt: str(data.dueAt) ?? null,
    zone: String(zone),
    repeat: repeatOf(data.repeat),
    source: { store: String(source.store), ref: String(source.ref) },
    status: status as FollowUpStatus,
    surfaced,
    createdAt: String(createdAt),
    updatedAt: String(updatedAt),
    ...(str(data.closedAt) ? { closedAt: String(data.closedAt) } : {}),
    ...(action ? { action } : {}),
    ...brainFieldsOf(data),
  };
}

function parsed(docs: ReadonlyArray<{ id: string; data: () => unknown }>): FollowUp[] {
  return docs.flatMap((d) => {
    const f = toFollowUp(d.id, d.data());
    if (!f)
      log.warn({ docId: d.id }, 'Skipped a follow-up document that does not match the schema');
    return f ? [f] : [];
  });
}

export function createFollowUpStore(db: Firestore): FollowUpStore & FollowUpAsker {
  const mine = (userId: string): CollectionReference =>
    db.collection('bogle_users').doc(userId).collection('follow_through');

  return {
    async open(f: NewFollowUp, now: Date): Promise<FollowUp> {
      const id = followUpId(f.source);
      const ref = mine(f.userId).doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const existing = snap.exists ? toFollowUp(id, snap.data()) : null;
        if (existing) return existing;
        const at = now.toISOString();
        const created: FollowUp = {
          ...f,
          id,
          status: 'open',
          surfaced: [],
          createdAt: at,
          updatedAt: at,
        };
        tx.set(ref, created);
        return created;
      });
    },

    async live(userId: string): Promise<FollowUp[]> {
      const snap = await mine(userId).where('status', 'in', LIVE).get();
      return parsed(snap.docs);
    },

    async due(now: Date, limit: number): Promise<FollowUp[]> {
      const snap = await db
        .collectionGroup('follow_through')
        .where('status', 'in', LIVE)
        .where('dueAt', '<=', now.toISOString())
        .orderBy('dueAt')
        .limit(limit)
        .get();
      return parsed(snap.docs);
    },

    async changedBetween(userId: string, from: Date, to: Date): Promise<FollowUp[]> {
      const snap = await mine(userId)
        .where('updatedAt', '>=', from.toISOString())
        .where('updatedAt', '<', to.toISOString())
        .get();
      return parsed(snap.docs);
    },

    async save(next: FollowUp, expectedUpdatedAt: string): Promise<boolean> {
      const ref = mine(next.userId).doc(next.id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? toFollowUp(next.id, snap.data()) : null;
        if (!current || current.updatedAt !== expectedUpdatedAt) return false;
        tx.set(ref, next);
        return true;
      });
    },

    async ask(userId, id, input, now): Promise<FollowUp | null> {
      const ref = mine(userId).doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? toFollowUp(id, snap.data()) : null;
        if (!current) return null;
        // Judged against the stored copy: a second worker sees the first ask and is refused
        const next = ask(current, input, now);
        if (!next.success) {
          log.info({ userId, followUpId: id, reason: next.error }, 'Follow-up ask refused');
          return null;
        }
        tx.set(ref, next.data);
        return next.data;
      });
    },
  };
}

/** The store on the app's Firestore, or null where there is none (local dev without credentials). */
export function firestoreFollowUpStore(): FollowUpStore | null {
  const db = getFirestoreDb();
  return db ? createFollowUpStore(db) : null;
}
