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

export function registerBuiltInMemoryDomains(): void {
  registerImportantDatesDomain();
}
