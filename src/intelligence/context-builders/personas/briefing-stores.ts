/**
 * The stores a teammate briefing reads (Maya, Jordan, Alex, Nayan), loaded for
 * the member first. Their getters read an in-memory cache that is empty until
 * loadUserData runs, so a briefing built without it read every member as
 * having no habits, goals or reflections and printed defaults as facts (#3044).
 *
 * @module intelligence/context-builders/personas/briefing-stores
 */

import { getFinancialStore } from '../../../services/stores/financial-store.js';
import { getProductivityStore } from '../../../services/stores/productivity-store.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'context:briefing-stores' });

/** Load the member's productivity and financial data; a failed load leaves that store empty. */
export async function loadBriefingStores(userId: string): Promise<void> {
  const results = await Promise.allSettled([
    getProductivityStore().loadUserData(userId),
    getFinancialStore().loadUserData(userId),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      log.warn({ userId, error: String(result.reason) }, 'Briefing store load failed');
    }
  }
}
