/**
 * Pending actions the person approves on a signed-in page (/p/:id).
 *
 * - The stored payload is what runs and what the page shows, unparaphrased.
 * - actionHash (sha256 of kind, owner, payload) is recorded with an approval,
 *   which then only satisfies an action with that hash: A never satisfies B.
 * - Actions expire 5 minutes after creation; an approval is used once.
 * - Money-moving kinds: never by voice; on the page only with a passkey (PasskeyCheck).
 *
 * @module services/approvals/pending-actions
 */

import { createHash, randomBytes } from 'node:crypto';
import type { Firestore, Transaction } from '@google-cloud/firestore';
import { APP_URL } from '../../config/api-urls.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

export const PENDING_ACTIONS_COLLECTION = 'pending_actions';
export const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;
/** How long after the approval the action may run. */
export const APPROVAL_USE_MS = 2 * 60 * 1000;
/** Firestore TTL field: the stored recipient and text are deleted a day later. */
const KEEP_MS = 24 * 60 * 60 * 1000;

export type PendingActionKind = 'send_text' | 'place_call' | 'purchase';
const KINDS: readonly PendingActionKind[] = ['send_text', 'place_call', 'purchase'];
const MONEY_MOVING: ReadonlySet<PendingActionKind> = new Set(['purchase']);

/** Flat, so the page can show every field exactly as stored. */
export type ActionPayload = Record<string, string | number>;

export interface PendingAction {
  id: string;
  userId: string;
  kind: PendingActionKind;
  payload: ActionPayload;
  actionHash: string;
  moneyMoving: boolean;
  createdAt: number;
  expiresAt: number;
  deleteAt: Date;
  status: 'pending' | 'approved' | 'declined' | 'used';
  decision?: {
    decision: 'approve' | 'decline';
    actionHash: string;
    decidedAt: number;
    authTime: number;
  };
}

export type DecisionOutcome =
  | 'approved'
  | 'declined'
  | 'not_found'
  | 'expired'
  | 'already_decided'
  | 'hash_mismatch'
  | 'passkey_required'
  | 'passkey_failed';

/** Runs INSIDE the decision's transaction, after its state checks and before the write. */
export type PasskeyCheck = (tx: Transaction) => Promise<boolean>;

const MAX_FIELDS = 12;
const MAX_VALUE_CHARS = 1000;
const ID = /^[A-Za-z0-9_-]{43}$/;
/** Words in a field name that mean it would carry card or account secrets. */
const SECRET_WORDS = new Set(
  'card cardnumber cc ccnum pan cvc cvv iban pin ssn routing password passcode secret token apikey'.split(
    ' '
  )
);

/** By whole word ("cardNumber", "card_cvc"), so "company" or "discard" never match. */
function isSecretKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return (
    words.some((w) => SECRET_WORDS.has(w)) ||
    (words.includes('account') && words.includes('number')) ||
    (words.includes('api') && words.includes('key'))
  );
}

/** True for a 13-19 digit run (single space . / - between digits allowed) passing Luhn. */
function looksLikeCardNumber(value: string): boolean {
  const runs = (value.match(/\d(?:[ ./-]?\d)*/g) ?? []).map((r) => r.replace(/\D/g, ''));
  for (const run of runs.filter((r) => r.length >= 13 && r.length <= 19)) {
    let sum = 0;
    for (let i = 0; i < run.length; i++) {
      let d = Number(run[run.length - 1 - i]);
      if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

/** Throws on a payload that is too big, nested, or carries secrets. */
export function assertStorablePayload(payload: ActionPayload): void {
  const entries = Object.entries(payload);
  if (entries.length === 0 || entries.length > MAX_FIELDS) throw new Error('payload size');
  for (const [key, value] of entries) {
    if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value)))
      throw new Error(`payload ${key} not flat`);
    if (isSecretKey(key)) throw new Error(`payload ${key} looks secret`);
    if (String(value).length > MAX_VALUE_CHARS) throw new Error(`payload ${key} too long`);
    if (looksLikeCardNumber(String(value))) throw new Error(`payload ${key} has a card number`);
  }
}

/** sha256 over a canonical (sorted-key) encoding of what would run, and for whom. */
export function hashAction(
  kind: PendingActionKind,
  userId: string,
  payload: ActionPayload
): string {
  const sorted = Object.keys(payload)
    .sort()
    .map((k) => [k, payload[k]]);
  return createHash('sha256')
    .update(JSON.stringify(['v1', kind, userId, sorted]))
    .digest('hex');
}

/** A spoken yes may satisfy this kind (never for money). */
export function voiceMayConfirm(kind: PendingActionKind): boolean {
  return !MONEY_MOVING.has(kind);
}

export async function createPendingAction(
  userId: string,
  kind: PendingActionKind,
  payload: ActionPayload,
  now = Date.now(),
  db: Firestore | null = getFirestoreDb()
): Promise<{ id: string; url: string; actionHash: string; expiresAt: number }> {
  if (!userId || !KINDS.includes(kind))
    throw new Error('pending action needs an owner and a known kind');
  if (!db) throw new Error('pending actions need Firestore');
  assertStorablePayload(payload);
  const id = randomBytes(32).toString('base64url');
  const action: PendingAction = {
    id,
    userId,
    kind,
    payload: { ...payload },
    actionHash: hashAction(kind, userId, payload),
    moneyMoving: MONEY_MOVING.has(kind),
    createdAt: now,
    expiresAt: now + PENDING_ACTION_TTL_MS,
    deleteAt: new Date(now + KEEP_MS),
    status: 'pending',
  };
  await db.collection(PENDING_ACTIONS_COLLECTION).doc(id).set(action);
  const { actionHash, expiresAt } = action;
  return { id, url: `${APP_URL}/p/${id}`, actionHash, expiresAt };
}

/** The action when userId owns it; null when missing, malformed or someone else's. */
export async function getPendingActionForUser(
  id: string,
  userId: string,
  db: Firestore | null = getFirestoreDb()
): Promise<PendingAction | null> {
  if (!db || !userId || !ID.test(id)) return null;
  const snap = await db.collection(PENDING_ACTIONS_COLLECTION).doc(id).get();
  const action = snap.exists ? (snap.data() as PendingAction) : null;
  return action && action.userId === userId ? action : null;
}

/** The stored hash still matches the stored action (the doc was not edited). */
function intact(action: PendingAction): boolean {
  return action.actionHash === hashAction(action.kind, action.userId, action.payload);
}

/**
 * Record the owner's decision, bound to the hash the page showed.
 * authTime is when they last signed in (ms); the route checks it is fresh.
 */
export async function decidePendingAction(
  input: {
    id: string;
    userId: string;
    decision: 'approve' | 'decline';
    actionHash: string;
    authTime: number;
    passkeyRequired?: boolean;
    passkeyCheck?: PasskeyCheck;
  },
  now = Date.now(),
  db: Firestore | null = getFirestoreDb()
): Promise<DecisionOutcome> {
  if (!db || !ID.test(input.id)) return 'not_found';
  const ref = db.collection(PENDING_ACTIONS_COLLECTION).doc(input.id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const action = snap.exists ? (snap.data() as PendingAction) : null;
    if (!action || action.userId !== input.userId) return 'not_found';
    if (action.status !== 'pending') return 'already_decided';
    if (now > action.expiresAt) return 'expired';
    if (!intact(action) || input.actionHash !== action.actionHash) return 'hash_mismatch';
    if (input.decision === 'approve' && (action.moneyMoving || input.passkeyRequired)) {
      if (!input.passkeyCheck) return 'passkey_required';
      if (!(await input.passkeyCheck(tx))) return 'passkey_failed';
    }
    const decision = {
      decision: input.decision,
      actionHash: action.actionHash,
      decidedAt: now,
      authTime: input.authTime,
    };
    tx.update(ref, { status: input.decision === 'approve' ? 'approved' : 'declined', decision });
    return input.decision === 'approve' ? 'approved' : 'declined';
  });
}

/**
 * Use a page approval once: true only when userId approved id in the last 2
 * minutes for exactly this kind and payload (hash recomputed here), unused.
 */
export async function consumePageApproval(
  id: string,
  userId: string,
  kind: PendingActionKind,
  payload: ActionPayload,
  now = Date.now(),
  db: Firestore | null = getFirestoreDb()
): Promise<boolean> {
  if (!db || !ID.test(id)) return false;
  const ref = db.collection(PENDING_ACTIONS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const action = snap.exists ? (snap.data() as PendingAction) : null;
    const ok =
      action !== null &&
      action.userId === userId &&
      action.status === 'approved' &&
      now <= (action.decision?.decidedAt ?? 0) + APPROVAL_USE_MS &&
      intact(action) &&
      action.decision?.actionHash === hashAction(kind, userId, payload);
    if (ok) tx.update(ref, { status: 'used' });
    return ok;
  });
}
