/**
 * Ports to modules other agents own, with safe defaults when they are absent:
 *
 * - Important dates (`src/services/important-dates/`): detected dates are sent
 *   through `upsertImportantDate`, upcoming dates come from `getUpcomingDates`.
 *   Without it, dates stay inside people profiles and upcoming dates are
 *   computed locally.
 * - Proactive boundaries (`src/services/user-preferences/`):
 *   `isTopicAllowedProactively(userId, topic)` is a HARD filter on predicted
 *   topics, openers, insights and per-turn person notes. Without it,
 *   everything is allowed.
 *
 * Resolution order: an explicitly registered port (tests, or wiring code),
 * else the module loaded by path at runtime, else the default.
 *
 * @module services/personal-insights/integrations
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { DetectedDate, ImportantDateKind } from './types.js';

const log = createLogger({ module: 'personal-insights-integrations' });

/** Exactly the important-dates contract signature. */
export interface ImportantDateInput {
  key: string;
  title: string;
  date: string;
  recurring: boolean;
  personId?: string;
  kind: ImportantDateKind;
  source: 'detected' | 'user';
  sourceConversationIds: string[];
  confidence: number;
}

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
const IMPORTANT_DATES_MODULE = '../important-dates/index.js';
const USER_PREFERENCES_MODULE = '../user-preferences/index.js';

export async function getImportantDatesPort(): Promise<ImportantDatesPort | null> {
  if (datesPort !== undefined) return datesPort;
  const mod = await loadModule(IMPORTANT_DATES_MODULE);
  datesPort = hasFunctions(mod, ['upsertImportantDate', 'getUpcomingDates'])
    ? (mod as ImportantDatesPort)
    : null;
  if (!datesPort) log.debug('Important-dates module not available: dates stay in people profiles');
  return datesPort;
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

/** Upcoming dates from the store, normalized; null when the store is unavailable. */
export async function upcomingFromStore(
  userId: string,
  withinDays: number
): Promise<Array<{
  title: string;
  date: string;
  personId?: string;
  kind: ImportantDateKind;
}> | null> {
  const port = await getImportantDatesPort();
  if (!port) return null;
  try {
    const rows = await port.getUpcomingDates(userId, withinDays);
    const out: Array<{ title: string; date: string; personId?: string; kind: ImportantDateKind }> =
      [];
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const row = r as Record<string, unknown>;
      if (typeof row.title !== 'string' || typeof row.date !== 'string') continue;
      const kind = typeof row.kind === 'string' ? (row.kind as ImportantDateKind) : 'other';
      out.push({
        title: row.title,
        date: row.date,
        personId: typeof row.personId === 'string' ? row.personId : undefined,
        kind,
      });
    }
    return out;
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
