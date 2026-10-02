/**
 * Memory domains that ship with the memory-control service.
 * New areas can register here or call registerMemoryDomain() from their own module.
 *
 * @module services/memory-control/builtin-domains
 */

import type { Result } from '../../types/result.js';
import { registerMemoryDomain } from './domains.js';

function unwrap<T, E>(result: Result<T, E>, what: string): T {
  if (result.success) return result.data;
  const error = result.error as { message?: unknown } | undefined;
  throw new Error(`${what}: ${String(error?.message ?? 'failed')}`);
}

/** Important dates (birthdays, anniversaries, events) — services/important-dates. */
export function registerImportantDatesDomain(): void {
  registerMemoryDomain({
    name: 'importantDates',
    exportFn: async (userId) => {
      const { exportImportantDates } = await import('../important-dates/index.js');
      return unwrap(await exportImportantDates(userId), 'export important dates');
    },
    deleteForConversation: async (userId, conversationId) => {
      const { deleteImportantDatesFor } = await import('../important-dates/index.js');
      const r = unwrap(
        await deleteImportantDatesFor(userId, conversationId),
        'delete important dates for conversation'
      );
      return r.updated + r.deleted;
    },
    deleteAll: async (userId) => {
      const { deleteAllImportantDates } = await import('../important-dates/index.js');
      return unwrap(await deleteAllImportantDates(userId), 'delete all important dates').deleted;
    },
    find: async (userId, query) => {
      const { findImportantDates } = await import('../important-dates/index.js');
      const found = await findImportantDates(userId, query);
      if (!found.success) return [];
      return found.data.map((d) => ({ id: d.id, label: `the date "${d.title}"`, score: 0.9 }));
    },
    forget: async (userId, id) => {
      const { deleteImportantDate } = await import('../important-dates/index.js');
      return unwrap(await deleteImportantDate(userId, id, 'voice_forget'), 'forget date').deleted;
    },
  });
}

const sum = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((total, n) => total + n, 0);

/** People/pet profiles, life threads, predictions — services/personal-insights (all derived). */
export function registerPersonalInsightsDomain(): void {
  registerMemoryDomain({
    name: 'personalInsights',
    exportFn: async (userId) => {
      const { getPeopleForApi, getLifeThreads } = await import('../personal-insights/index.js');
      const [people, lifeThreads] = await Promise.all([
        getPeopleForApi(userId),
        getLifeThreads(userId),
      ]);
      return { people, lifeThreads };
    },
    deleteForConversation: async (userId, conversationId) => {
      const { deleteDerivedFor } = await import('../personal-insights/index.js');
      return sum(await deleteDerivedFor(userId, conversationId));
    },
    deleteAll: async (userId) => {
      const { deleteAllDerived } = await import('../personal-insights/index.js');
      return sum(await deleteAllDerived(userId));
    },
    // One recompute covers any number of removed facts.
    deleteForFacts: async (userId, factIds) => {
      const { deleteDerivedForFact } = await import('../personal-insights/index.js');
      if (factIds[0]) await deleteDerivedForFact(userId, factIds[0]);
      return 0;
    },
  });
}

/** Style, boundaries, likes, interests, media, food — services/user-preferences. */
export function registerUserPreferencesDomain(): void {
  registerMemoryDomain({
    name: 'preferences',
    exportFn: async (userId) => {
      const { exportPreferences } = await import('../user-preferences/index.js');
      return exportPreferences(userId);
    },
    deleteForConversation: async (userId, conversationId) => {
      const { deletePreferencesFor } = await import('../user-preferences/index.js');
      return deletePreferencesFor(userId, conversationId);
    },
    deleteAll: async (userId) => {
      const { deleteAllPreferences } = await import('../user-preferences/index.js');
      return deleteAllPreferences(userId);
    },
    deleteForFacts: async (userId, factIds) => {
      const { deletePreferencesDerivedFromFact } = await import('../user-preferences/index.js');
      let changed = 0;
      for (const id of factIds) changed += await deletePreferencesDerivedFromFact(userId, id);
      return changed;
    },
    find: async (userId, query) => {
      const { listPreferences } = await import('../user-preferences/index.js');
      const { matchScore, tokenize } = await import('./find.js');
      const tokens = tokenize(query);
      if (tokens.length === 0) return [];
      return (await listPreferences(userId))
        .map((p) => ({
          id: p.id,
          label:
            p.sentiment === 'dislike'
              ? `that you don't like ${p.value}`
              : `your preference "${p.value}"`,
          score: matchScore(tokens, `${p.key} ${p.value}`),
        }))
        .filter((m) => m.score >= 0.5);
    },
    forget: async (userId, id) => {
      const { deletePreference } = await import('../user-preferences/index.js');
      return deletePreference(userId, id, 'voice_forget');
    },
  });
}

export function registerBuiltInMemoryDomains(): void {
  registerImportantDatesDomain();
  registerPersonalInsightsDomain();
  registerUserPreferencesDomain();
}
