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

/** Dreams, goals and habits — services/aspirations. */
export function registerAspirationsDomain(): void {
  registerMemoryDomain({
    name: 'aspirations',
    exportFn: async (userId) => {
      const { exportAspirations } = await import('../aspirations/index.js');
      return unwrap(await exportAspirations(userId), 'export aspirations');
    },
    deleteForConversation: async (userId, conversationId) => {
      const { deleteAspirationsFor } = await import('../aspirations/index.js');
      const r = unwrap(
        await deleteAspirationsFor(userId, conversationId),
        'delete aspirations for conversation'
      );
      return r.updated + r.deleted;
    },
    deleteAll: async (userId) => {
      const { deleteAllAspirations } = await import('../aspirations/index.js');
      return unwrap(await deleteAllAspirations(userId), 'delete all aspirations').deleted;
    },
    find: async (userId, query) => {
      const { findAspirations } = await import('../aspirations/index.js');
      const found = await findAspirations(userId, query);
      if (!found.success) return [];
      return found.data.map((a) => ({
        id: a.id,
        label: `your ${a.level} "${a.title}"`,
        score: 0.85,
      }));
    },
    forget: async (userId, id) => {
      const { deleteAspiration } = await import('../aspirations/index.js');
      return unwrap(await deleteAspiration(userId, id, 'voice_forget'), 'forget aspiration')
        .deleted;
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

/** Health items, mood timeline and the sensitive-memory consent record — services/health-memory. */
export function registerHealthMemoryDomain(): void {
  registerMemoryDomain({
    name: 'health',
    exportFn: async (userId) => {
      const { exportHealthMemory } = await import('../health-memory/index.js');
      return exportHealthMemory(userId);
    },
    deleteForConversation: async (userId, conversationId) => {
      const { deleteHealthFor, deleteMoodFor } = await import('../health-memory/index.js');
      return (
        (await deleteHealthFor(userId, conversationId)) +
        (await deleteMoodFor(userId, conversationId))
      );
    },
    deleteAll: async (userId) => {
      const { deleteAllHealth, deleteAllMood } = await import('../health-memory/index.js');
      return (await deleteAllHealth(userId)) + (await deleteAllMood(userId));
    },
    deleteForFacts: async (userId, factIds) => {
      const { deleteHealthDerivedFromFacts } = await import('../health-memory/index.js');
      return deleteHealthDerivedFromFacts(userId, factIds);
    },
    find: async (userId, query) => {
      const { findHealthMemory } = await import('../health-memory/index.js');
      return findHealthMemory(userId, query);
    },
    forget: async (userId, id) => {
      const { deleteHealthItem } = await import('../health-memory/index.js');
      return deleteHealthItem(userId, id, 'voice_forget');
    },
  });
}

/** Work & career, travel & places — services/work-and-places (one domain per area). */
export function registerWorkAndPlacesDomains(): void {
  for (const area of ['work', 'places'] as const) {
    registerMemoryDomain({
      name: area,
      exportFn: async (userId) => {
        const { exportLifeArea } = await import('../work-and-places/index.js');
        return exportLifeArea(userId, area);
      },
      // Both areas cascade in one pass, so only 'work' runs the shared hooks.
      deleteForConversation: async (userId, conversationId) => {
        if (area !== 'work') return 0;
        const { deleteWorkAndPlacesFor } = await import('../work-and-places/index.js');
        return deleteWorkAndPlacesFor(userId, conversationId);
      },
      deleteAll: async (userId) => {
        const { deleteAllWorkAndPlaces } = await import('../work-and-places/index.js');
        return deleteAllWorkAndPlaces(userId, area);
      },
      deleteForFacts: async (userId, factIds) => {
        if (area !== 'work') return 0;
        const { deleteWorkAndPlacesForFacts } = await import('../work-and-places/index.js');
        return deleteWorkAndPlacesForFacts(userId, factIds);
      },
      find: async (userId, query) => {
        const { findLifeItems } = await import('../work-and-places/index.js');
        const { matchScore, tokenize } = await import('./find.js');
        const tokens = tokenize(query);
        if (tokens.length === 0) return [];
        return findLifeItems(userId, area, (text) => matchScore(tokens, text));
      },
      forget: async (userId, id) => {
        const { forgetLifeItem } = await import('../work-and-places/index.js');
        return (await forgetLifeItem(userId, area, id, 'voice_forget')).success;
      },
    });
  }
}

/** Money memory (only with Money consent) — services/finance-memory. */
export function registerFinanceMemoryDomain(): void {
  registerMemoryDomain({
    name: 'finances',
    exportFn: async (userId) => {
      const { exportFinanceMemory } = await import('../finance-memory/index.js');
      return exportFinanceMemory(userId);
    },
    deleteForConversation: async (userId, conversationId) => {
      const { deleteFinanceFor } = await import('../finance-memory/index.js');
      return deleteFinanceFor(userId, conversationId);
    },
    deleteAll: async (userId) => {
      const { deleteAllFinance } = await import('../finance-memory/index.js');
      return deleteAllFinance(userId);
    },
    deleteForFacts: async (userId, factIds) => {
      const { deleteFinanceDerivedFromFacts } = await import('../finance-memory/index.js');
      return deleteFinanceDerivedFromFacts(userId, factIds);
    },
    find: async (userId, query) => {
      const { findFinanceMemory } = await import('../finance-memory/index.js');
      return findFinanceMemory(userId, query);
    },
    forget: async (userId, id) => {
      const { forgetFinanceItem } = await import('../finance-memory/index.js');
      return forgetFinanceItem(userId, id, 'voice_forget');
    },
  });
}

export function registerBuiltInMemoryDomains(): void {
  registerImportantDatesDomain();
  registerAspirationsDomain();
  registerPersonalInsightsDomain();
  registerUserPreferencesDomain();
  registerHealthMemoryDomain();
  registerWorkAndPlacesDomains();
  registerFinanceMemoryDomain();
}
