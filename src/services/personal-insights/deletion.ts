/**
 * Deletion hooks for the memory-control cascade (Agent C's service).
 *
 * Everything personal-insights stores is derived and carries
 * `sourceConversationIds`. Call these AFTER the sources are deleted:
 *
 *   deleteConversation(userId, convId) → deleteDerivedFor(userId, convId)
 *     removes every people profile, life thread, prediction outcome and the
 *     insight bundle that cite the conversation, then recomputes from what
 *     remains (so people/threads still supported by other conversations come
 *     back without the deleted material).
 *   deleteAllMemories(userId) → deleteAllDerived(userId)
 *   deleteFact(userId, factId) → deleteDerivedForFact(userId, factId)
 *   deletePerson(userId, personId) → deletePersonProfile(userId, personId)
 *     deletes the profile and tombstones the person id so it is not rebuilt;
 *     returns the source fact/entity ids so C can delete/tombstone them too.
 *
 * @module services/personal-insights/deletion
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  invalidatePersonalInsightsCache,
  refreshPersonalInsights,
  type PipelineDeps,
} from './pipeline.js';
import { createFirestoreInsightsStore, type InsightsStore } from './firestore-store.js';

const log = createLogger({ module: 'personal-insights-deletion' });

let fallbackStore: InsightsStore | null = null;
const storeOf = (d: PipelineDeps) => d.store ?? (fallbackStore ??= createFirestoreInsightsStore());

export interface DeleteOptions extends PipelineDeps {
  /** Recompute from remaining sources afterwards (default true). */
  recompute?: boolean;
}

export async function deleteDerivedFor(
  userId: string,
  conversationId: string,
  options: DeleteOptions = {}
): Promise<Record<string, number>> {
  invalidatePersonalInsightsCache(userId);
  try {
    const counts = await storeOf(options).deleteDerivedFor(userId, conversationId);
    log.info({ userId, conversationId, counts }, 'Derived insights deleted for conversation');
    if (options.recompute !== false) await refreshPersonalInsights(userId, options);
    return counts;
  } catch (error) {
    log.error({ error: String(error), userId, conversationId }, 'Derived insights delete failed');
    throw error;
  } finally {
    invalidatePersonalInsightsCache(userId);
  }
}

export async function deleteAllDerived(
  userId: string,
  options: PipelineDeps = {}
): Promise<Record<string, number>> {
  invalidatePersonalInsightsCache(userId);
  const counts = await storeOf(options).deleteAllDerived(userId);
  log.info({ userId, counts }, 'All derived insights deleted');
  return counts;
}

/**
 * A single fact was deleted (and tombstoned by C): recompute so profiles,
 * threads and openers that used it are rebuilt without it.
 */
export async function deleteDerivedForFact(
  userId: string,
  factId: string,
  options: PipelineDeps = {}
): Promise<void> {
  invalidatePersonalInsightsCache(userId);
  log.info({ userId, factId }, 'Recomputing insights after fact deletion');
  await refreshPersonalInsights(userId, options);
  invalidatePersonalInsightsCache(userId);
}

export interface DeletedPerson {
  deleted: boolean;
  /** dynamic_facts ids the profile was built from (C may delete/tombstone them). */
  sourceFactIds: string[];
  sourceConversationIds: string[];
}

export async function deletePersonProfile(
  userId: string,
  personId: string,
  options: DeleteOptions = {}
): Promise<DeletedPerson> {
  invalidatePersonalInsightsCache(userId);
  const store = storeOf(options);
  const person = await store.deletePerson(userId, personId);
  await store.writeTombstone(userId, personId);
  if (options.recompute !== false) await refreshPersonalInsights(userId, options);
  invalidatePersonalInsightsCache(userId);
  return {
    deleted: person !== null,
    sourceFactIds: [...(person?.sourceFactIds ?? [])],
    sourceConversationIds: [...(person?.sourceConversationIds ?? [])],
  };
}
