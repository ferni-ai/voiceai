/**
 * Identity merge — fold an anonymous identity's memory into an account.
 *
 * When someone who used Ferni anonymously (a Firebase anonymous uid on a
 * phone, or a `device:` id in a browser) signs in, everything Ferni learned
 * about them moves to the signed-in account: conversations with their turns,
 * threads, summaries, facts, entities, relationships, tombstones and vector
 * entries. Then:
 *
 * - `bogle_users/{accountUid}/linked_identities/{anonId}` records the link;
 * - `bogle_users/{anonId}` gets a redirect marker (`mergedInto`) so later
 *   sessions that still present the anonymous identity resolve to the account.
 *
 * Safety properties:
 * - Claim first: the redirect marker is written in a transaction before any
 *   data moves, so new sessions write to the account straight away and a
 *   second account can never claim the same anonymous identity.
 * - Idempotent and resumable: every chunk moves in a transaction (see
 *   identity-merge-collections), profile counters merge exactly once, and a
 *   re-run picks up whatever is left.
 *
 * This module never decides whether the caller may merge; callers must have
 * verified both identities belong to the same client.
 *
 * @module services/identity/identity-merge
 */

import type { DocumentData, DocumentReference, Firestore } from '@google-cloud/firestore';
import { failure, success, type Result } from '../../types/result.js';
import { isEphemeralUserId } from '../../utils/ephemeral-identity.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  factMoveSpec,
  moveCollection,
  moveVectorEntries,
  preferTarget,
  type MoveSpec,
  type MoveStats,
} from './identity-merge-collections.js';
import { recordIdentityEvent } from './identity-metrics.js';
import { readRedirectMarker, USERS_COLLECTION } from './identity-redirect.js';

const log = createLogger({ module: 'identity-merge' });

export const LINKED_IDENTITIES = 'linked_identities';

export type MergeReason = 'anonymous_upgrade' | 'device_claim';

export interface MergeRequest {
  /** Anonymous identity being folded in (Firebase anonymous uid or `device:…`). */
  readonly sourceId: string;
  /** Signed-in account that keeps the memory. */
  readonly targetId: string;
  readonly reason: MergeReason;
}

export interface MergeReport {
  readonly status: 'complete' | 'incomplete';
  /** Per collection: docs moved (new on target) + merged (combined with a target doc). */
  readonly collections: Readonly<Record<string, MoveStats>>;
  /** True when this run merged the profile (first run only). */
  readonly profileMerged: boolean;
}

export type MergeErrorCode =
  | 'same_identity'
  | 'invalid_identity'
  | 'claimed_by_other_account'
  | 'target_is_merged'
  | 'failed';

export interface MergeError {
  readonly code: MergeErrorCode;
  readonly message: string;
}

/** Subcollections under `bogle_users/{uid}`, moved in this order. */
const SUBCOLLECTIONS: ReadonlyArray<readonly [string, (targetRef: DocumentReference) => MoveSpec]> =
  [
    // Tombstones first so the fact move honours deletions made on either side.
    ['memory_tombstones', () => ({ resolve: preferTarget })],
    ['dynamic_facts', (targetRef) => factMoveSpec(targetRef)],
    ['conversations', () => ({ resolve: preferTarget, children: ['turns'] })],
    ['conversation_threads', () => ({ resolve: preferTarget, children: ['messages'] })],
    ['summaries', () => ({ resolve: preferTarget })],
    ['dynamic_entities', () => ({ resolve: preferTarget })],
    ['dynamic_relationships', () => ({ resolve: preferTarget })],
    ['moments', () => ({ resolve: preferTarget })],
    ['goals', () => ({ resolve: preferTarget })],
    ['aspirations', () => ({ resolve: preferTarget })], // dreams/goals/habits (services/aspirations)
    // Collections the older device→account migration already carried.
    ...[
      'memories',
      'promoted_entities',
      'emotional_arcs',
      'topic_patterns',
      'voice_sessions',
      'deep_understanding',
      'ferni_commitments',
      'memory_highlights',
      'shared_moments',
      'humanization',
      'persona_affinities',
    ].map((name) => [name, () => ({ resolve: preferTarget })] as const),
  ];

/** Profile fields that belong to the merge machinery, never copied. */
const MARKER_FIELDS = ['mergedInto', 'mergedAt', 'mergeStatus', 'migratedTo', '_migrated'];

function stripMarkers(data: DocumentData): DocumentData {
  const copy = { ...data };
  for (const field of MARKER_FIELDS) delete copy[field];
  return copy;
}

function mergeProfiles(
  source: DocumentData,
  target: DocumentData | undefined,
  targetId: string,
  sourceId: string
): DocumentData {
  const linked = (doc: DocumentData | undefined): string[] =>
    Array.isArray(doc?.linkedIdentifiers) ? (doc.linkedIdentifiers as string[]) : [];
  const linkedIdentifiers = [...new Set([...linked(target), ...linked(source), sourceId])];
  if (!target) {
    return { ...stripMarkers(source), id: targetId, linkedIdentifiers };
  }
  const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const realName = (v: unknown): v is string =>
    typeof v === 'string' && v.trim().length > 0 && v !== 'Friend';
  return {
    ...target,
    name: realName(target.name) ? target.name : (source.name ?? target.name),
    totalConversations: count(target.totalConversations) + count(source.totalConversations),
    linkedIdentifiers,
  };
}

function validate(req: MergeRequest): MergeError | null {
  if (req.sourceId === req.targetId) return { code: 'same_identity', message: 'Nothing to merge' };
  if (isEphemeralUserId(req.sourceId) || isEphemeralUserId(req.targetId)) {
    return { code: 'invalid_identity', message: 'Per-session identities hold no durable memory' };
  }
  if (
    req.targetId.startsWith('device:') ||
    req.targetId.includes('/') ||
    req.sourceId.includes('/')
  ) {
    return { code: 'invalid_identity', message: 'Merge target must be a signed-in account' };
  }
  return null;
}

/**
 * Claim the source for the target (redirect marker + link record) and merge
 * the profile once. Fails if another account already claimed the source.
 */
async function claim(db: Firestore, req: MergeRequest): Promise<Result<boolean, MergeError>> {
  const users = db.collection(USERS_COLLECTION);
  const sourceRef = users.doc(req.sourceId);
  const targetRef = users.doc(req.targetId);
  const linkRef = targetRef.collection(LINKED_IDENTITIES).doc(req.sourceId);
  const now = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const [sourceSnap, targetSnap, linkSnap] = await tx.getAll(sourceRef, targetRef, linkRef);
    const source = sourceSnap.exists ? sourceSnap.data() : undefined;
    const target = targetSnap.exists ? targetSnap.data() : undefined;
    const link = linkSnap.exists ? linkSnap.data() : undefined;

    const existing = readRedirectMarker(source);
    if (existing && existing.mergedInto !== req.targetId) {
      return failure<MergeError>({
        code: 'claimed_by_other_account',
        message: 'Already linked to another account',
      });
    }
    if (readRedirectMarker(target)) {
      return failure<MergeError>({
        code: 'target_is_merged',
        message: 'Target account was itself merged away',
      });
    }

    const firstProfileMerge = link?.profileMerged !== true;
    if (firstProfileMerge && source) {
      tx.set(targetRef, mergeProfiles(source, target, req.targetId, req.sourceId));
    }
    tx.set(
      sourceRef,
      { mergedInto: req.targetId, mergedAt: existing?.mergedAt || now, mergeStatus: 'in_progress' },
      { merge: true }
    );
    tx.set(
      linkRef,
      {
        sourceId: req.sourceId,
        reason: typeof link?.reason === 'string' ? link.reason : req.reason,
        linkedAt: typeof link?.linkedAt === 'string' ? link.linkedAt : now,
        updatedAt: now,
        status: 'in_progress',
        profileMerged: true,
      },
      { merge: true }
    );
    return success(firstProfileMerge && source !== undefined);
  });
}

/**
 * Merge `sourceId`'s memory into `targetId`. Safe to call repeatedly and
 * concurrently; returns `incomplete` when a safety stop was hit (call again).
 */
export async function mergeIdentityInto(
  db: Firestore,
  req: MergeRequest
): Promise<Result<MergeReport, MergeError>> {
  const invalid = validate(req);
  if (invalid) return failure(invalid);

  const ctx = {
    source: req.sourceId.slice(0, 16),
    target: req.targetId.slice(0, 8),
    reason: req.reason,
  };
  recordIdentityEvent('mergesStarted');
  log.info(ctx, 'Identity merge starting');

  try {
    const claimed = await claim(db, req);
    if (!claimed.success) {
      log.warn({ ...ctx, code: claimed.error.code }, 'Identity merge refused');
      return claimed;
    }

    const users = db.collection(USERS_COLLECTION);
    const sourceRef = users.doc(req.sourceId);
    const targetRef = users.doc(req.targetId);
    const collections: Record<string, MoveStats> = {};

    for (const [name, specFor] of SUBCOLLECTIONS) {
      collections[name] = await moveCollection(
        db,
        sourceRef.collection(name),
        targetRef.collection(name),
        specFor(targetRef)
      );
    }
    collections.vectors = await moveVectorEntries(db, req.sourceId, req.targetId);

    const complete = Object.values(collections).every((s) => s.complete);
    const status = complete ? 'complete' : 'in_progress';
    const now = new Date().toISOString();
    const batch = db.batch();
    batch.set(sourceRef, { mergeStatus: status }, { merge: true });
    batch.set(
      targetRef.collection(LINKED_IDENTITIES).doc(req.sourceId),
      { status, updatedAt: now, ...(complete ? { completedAt: now } : {}) },
      { merge: true }
    );
    await batch.commit();

    recordIdentityEvent(complete ? 'mergesCompleted' : 'mergesIncomplete');
    const counts = Object.fromEntries(
      Object.entries(collections)
        .filter(([, s]) => s.moved + s.merged + s.dropped > 0)
        .map(([k, s]) => [k, s.moved + s.merged])
    );
    log.info({ ...ctx, status, counts }, 'Identity merge finished');
    return success({
      status: complete ? 'complete' : 'incomplete',
      collections,
      profileMerged: claimed.data,
    });
  } catch (error) {
    recordIdentityEvent('mergesFailed');
    log.error({ ...ctx, error: String(error) }, 'Identity merge failed (resumable)');
    return failure({ code: 'failed', message: String(error) });
  }
}
