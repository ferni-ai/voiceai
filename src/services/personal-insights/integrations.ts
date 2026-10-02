/**
 * Ports to modules other agents own, with safe defaults when they are absent:
 *
 * - Important dates (`src/services/important-dates/`, imported directly):
 *   detected dates are sent through `upsertImportantDate`, upcoming dates come
 *   from `getUpcomingDates`. If the store is unavailable (no Firestore), dates
 *   stay inside people profiles and upcoming dates are computed locally.
 * - Proactive boundaries (`src/services/user-preferences/`):
 *   `isTopicAllowedProactively(userId, topic)` is a HARD filter on predicted
 *   topics, openers, insights and per-turn person notes. Without it,
 *   everything is allowed.
 *
 * Resolution order: an explicitly registered port (tests), else the real
 * module (important dates) / the module loaded by path at runtime
 * (user-preferences, not landed yet), else the default.
 *
 * @module services/personal-insights/integrations
 */

import {
  getUpcomingDates as storeUpcomingDates,
  upsertImportantDate as storeUpsertImportantDate,
  type ImportantDateInput,
} from '../important-dates/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { DetectedDate, ImportantDateKind, UpcomingDate } from './types.js';

export type { ImportantDateInput };

const log = createLogger({ module: 'personal-insights-integrations' });

export interface ImportantDatesPort {
  upsertImportantDate(userId: string, input: ImportantDateInput): Promise<unknown>;
  getUpcomingDates(userId: string, withinDays: number): Promise<unknown[]>;
}

export interface BoundariesPort {
  isTopicAllowedProactively(userId: string, topic: string): Promise<boolean>;
}

let datesPort: ImportantDatesPort | null | undefined;
let boundariesPort: BoundariesPort | null | undefined;

/** Register (or clear with null) the important-dates port. */
export function registerImportantDatesPort(port: ImportantDatesPort | null): void {
  datesPort = port;
}

/** Register (or clear with null) the proactive-boundaries port. */
export function registerBoundariesPort(port: BoundariesPort | null): void {
  boundariesPort = port;
}

/** Forget registrations so the next call re-resolves (tests). */
export function resetIntegrationPorts(): void {
  datesPort = undefined;
  boundariesPort = undefined;
}

function hasFunctions(mod: unknown, names: string[]): boolean {
  return (
    !!mod &&
    typeof mod === 'object' &&
    names.every((n) => typeof (mod as Record<string, unknown>)[n] === 'function')
  );
}

async function loadModule(path: string): Promise<unknown> {
  try {
    return (await import(/* @vite-ignore */ path)) as unknown;
  } catch {
    return null;
  }
}

// Paths are variables so this builds whether or not the modules exist yet.
/** The real important-dates store behind the port (Result failures become throws). */
const importantDatesStore: ImportantDatesPort = {
  async upsertImportantDate(userId, input) {
    const result = await storeUpsertImportantDate(userId, input);
    if (!result.success) throw result.error;
    return result.data;
  },
  async getUpcomingDates(userId, withinDays) {
    const result = await storeUpcomingDates(userId, withinDays);
    if (!result.success) throw result.error;
    return result.data;
  },
};
const USER_PREFERENCES_MODULE = '../user-preferences/index.js';

export async function getImportantDatesPort(): Promise<ImportantDatesPort | null> {
  return datesPort === undefined ? importantDatesStore : datesPort;
}

export async function getBoundariesPort(): Promise<BoundariesPort | null> {
  if (boundariesPort !== undefined) return boundariesPort;
  const mod = await loadModule(USER_PREFERENCES_MODULE);
  boundariesPort = hasFunctions(mod, ['isTopicAllowedProactively'])
    ? (mod as BoundariesPort)
    : null;
  if (!boundariesPort) log.debug('User-preferences module not available: all topics allowed');
  return boundariesPort;
}

/** Send detected dates to the important-dates store. Never throws. */
export async function syncDetectedDates(
  userId: string,
  dates: readonly DetectedDate[]
): Promise<number> {
  const port = await getImportantDatesPort();
  if (!port) return 0;
  let synced = 0;
  for (const d of dates) {
    try {
      await port.upsertImportantDate(userId, {
        key: d.key,
        title: d.title,
        date: d.date,
        recurring: d.recurring,
        personId: d.personId,
        kind: d.kind,
        source: 'detected',
        sourceConversationIds: [...d.sourceConversationIds],
        confidence: d.confidence,
      });
      synced++;
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Important date not synced');
    }
  }
  return synced;
}

/**
 * Upcoming dates from the store (its own time-zone-aware day counts), or null
 * when the store is unavailable so the caller falls back to local detection.
 */
export async function upcomingFromStore(
  userId: string,
  withinDays: number
): Promise<UpcomingDate[] | null> {
  const port = await getImportantDatesPort();
  if (!port) return null;
  try {
    const rows = await port.getUpcomingDates(userId, withinDays);
    const out: UpcomingDate[] = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const row = r as Record<string, unknown>;
      // Store shape: { record: { title, date, kind, personId }, daysUntil }
      const rec = (row.record && typeof row.record === 'object' ? row.record : row) as Record<
        string,
        unknown
      >;
      if (typeof rec.title !== 'string' || typeof rec.date !== 'string') continue;
      const daysAway = typeof row.daysUntil === 'number' ? row.daysUntil : null;
      if (daysAway === null || daysAway < 0 || daysAway > withinDays) continue;
      out.push({
        title: rec.title,
        date: rec.date,
        daysAway,
        personId: typeof rec.personId === 'string' ? rec.personId : undefined,
        kind: typeof rec.kind === 'string' ? (rec.kind as ImportantDateKind) : 'other',
      });
    }
    return out.sort((a, b) => a.daysAway - b.daysAway);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Upcoming dates unavailable');
    return null;
  }
}

/** Keep only items whose topic the user allows Ferni to raise. Fails closed per item. */
export async function filterAllowed<T>(
  userId: string,
  items: readonly T[],
  topicOf: (item: T) => string
): Promise<T[]> {
  const port = await getBoundariesPort();
  if (!port) return [...items];
  const out: T[] = [];
  for (const item of items) {
    try {
      if (await port.isTopicAllowedProactively(userId, topicOf(item))) out.push(item);
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Boundary check failed: item withheld');
    }
  }
  return out;
}
