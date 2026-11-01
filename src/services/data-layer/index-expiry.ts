/**
 * When a semantic index document expires. A policy's ttlDays (entity-policies.ts) was declared
 * for ~50 entity types but never enforced, so the index kept everything forever. It is enforced
 * here only for the types listed: an inside joke's copy keeps the caller's words, and goes a year
 * after it is written, like the shared moment it copies (utils/shared-moment-retention.ts, #2971).
 * Enforcing the other ttlDays would change what recall finds, so each needs its own decision.
 * FirestoreVectorStore writes it as expireAt; search drops a document past it (Firestore TTL
 * deletes late, and only once a TTL policy on vectors.expireAt is enabled).
 *
 * @module services/data-layer/index-expiry
 */
import { getEntityPolicy } from './indexing-policy.js';
import type { EntityType } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The entity types whose ttlDays the index enforces */
const EXPIRES_IN_INDEX: ReadonlySet<EntityType> = new Set<EntityType>(['inside_joke']);

/** When a document indexed now for this entity type expires; undefined: it doesn't */
export function indexExpireAt(entityType: EntityType, now: number = Date.now()): Date | undefined {
  const ttlDays = getEntityPolicy(entityType)?.ttlDays ?? 0;
  if (!EXPIRES_IN_INDEX.has(entityType) || ttlDays <= 0) return undefined;
  return new Date(now + ttlDays * DAY_MS);
}
