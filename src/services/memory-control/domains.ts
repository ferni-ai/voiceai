/**
 * Memory domain registry.
 *
 * Other memory areas (important dates, people insights, preferences, goals,
 * habits, ...) register themselves here so that every memory-control
 * operation covers them: conversation delete, "delete all my memory",
 * account erasure, export, and voice forget.
 *
 *   registerMemoryDomain({
 *     name: 'importantDates',
 *     exportFn: (uid) => ...,                     // JSON-safe data for the export
 *     deleteForConversation: (uid, convId) => ..., // cascade, returns items changed
 *     deleteAll: (uid) => ...,                     // wipe, returns items removed
 *     find: (uid, query) => [{ id, label, score }],// optional: voice forget search
 *     forget: (uid, id) => true,                   // optional: delete one found item
 *   });
 *
 * Hooks are isolated: one domain failing never stops the others. Failures
 * are reported (so callers can tell the user the truth) rather than thrown.
 *
 * @module services/memory-control/domains
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryDomains' });

export interface MemoryDomainMatch {
  id: string;
  label: string;
  score: number;
}

export interface MemoryDomain {
  /** Unique, stable name; also the key in exports and deletion reports. */
  name: string;
  exportFn?: (userId: string) => Promise<unknown>;
  deleteForConversation?: (userId: string, conversationId: string) => Promise<number>;
  deleteAll?: (userId: string) => Promise<number>;
  find?: (userId: string, query: string) => Promise<MemoryDomainMatch[]>;
  forget?: (userId: string, id: string) => Promise<boolean>;
}

export type DomainOutcome = number | 'failed';

const domains = new Map<string, MemoryDomain>();
let builtInsLoaded = false;

/** Register (or replace) a domain. Safe to call more than once with the same name. */
export function registerMemoryDomain(domain: MemoryDomain): void {
  domains.set(domain.name, domain);
}

export function unregisterMemoryDomain(name: string): void {
  domains.delete(name);
}

/** Tests: drop everything, including built-ins (they reload on next use unless disabled). */
export function resetMemoryDomains(options: { loadBuiltIns?: boolean } = {}): void {
  domains.clear();
  builtInsLoaded = options.loadBuiltIns === false;
}

async function loadBuiltIns(): Promise<void> {
  if (builtInsLoaded) return;
  builtInsLoaded = true;
  try {
    const { registerBuiltInMemoryDomains } = await import('./builtin-domains.js');
    registerBuiltInMemoryDomains();
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not load built-in memory domains');
  }
}

export async function getMemoryDomains(): Promise<MemoryDomain[]> {
  await loadBuiltIns();
  return [...domains.values()];
}

async function runEach(
  pick: (d: MemoryDomain) => (() => Promise<number>) | undefined,
  what: string,
  errors?: string[]
): Promise<Record<string, DomainOutcome>> {
  const out: Record<string, DomainOutcome> = {};
  for (const domain of await getMemoryDomains()) {
    const run = pick(domain);
    if (!run) continue;
    try {
      out[domain.name] = await run();
    } catch (error) {
      out[domain.name] = 'failed';
      errors?.push(`domain ${domain.name}: ${String(error)}`);
      log.warn({ domain: domain.name, error: String(error) }, `Memory domain ${what} failed`);
    }
  }
  return out;
}

/** Cascade a conversation delete into every domain, for each ID the conversation goes by. */
export function deleteDomainsForConversation(
  userId: string,
  conversationIds: readonly string[]
): Promise<Record<string, DomainOutcome>> {
  return runEach((d) => {
    const hook = d.deleteForConversation;
    if (!hook) return undefined;
    return async () => {
      let total = 0;
      for (const id of conversationIds) total += await hook(userId, id);
      return total;
    };
  }, 'conversation delete');
}

export function deleteAllDomains(
  userId: string,
  errors?: string[]
): Promise<Record<string, DomainOutcome>> {
  return runEach(
    (d) => {
      const hook = d.deleteAll;
      return hook ? () => hook(userId) : undefined;
    },
    'delete-all',
    errors
  );
}

/** `{ [domainName]: data }`; a domain that fails to export is left out and logged. */
export async function exportDomains(userId: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const domain of await getMemoryDomains()) {
    if (!domain.exportFn) continue;
    try {
      out[domain.name] = await domain.exportFn(userId);
    } catch (error) {
      log.warn({ domain: domain.name, error: String(error) }, 'Memory domain export failed');
    }
  }
  return out;
}

export async function findInDomains(
  userId: string,
  query: string
): Promise<Array<MemoryDomainMatch & { domain: string }>> {
  const out: Array<MemoryDomainMatch & { domain: string }> = [];
  for (const domain of await getMemoryDomains()) {
    if (!domain.find || !domain.forget) continue;
    try {
      for (const m of await domain.find(userId, query)) out.push({ ...m, domain: domain.name });
    } catch (error) {
      log.warn({ domain: domain.name, error: String(error) }, 'Memory domain search failed');
    }
  }
  return out;
}

export async function forgetInDomain(
  userId: string,
  domainName: string,
  id: string
): Promise<boolean> {
  await loadBuiltIns();
  const domain = domains.get(domainName);
  if (!domain?.forget) return false;
  return domain.forget(userId, id);
}
