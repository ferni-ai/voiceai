/**
 * Refusing a store read or write keyed by a shared placeholder id (#2651), logged and
 * counted: `refusedPlaceholder(userId, site)` is true for a placeholder (isSharedPlaceholderId)
 * and logs the site with its per-process count at 1, 10, 100, ..., so a busy path is
 * visible without a line per call. It never logs the id or any content.
 *
 * @module utils/placeholder-refusal
 */
import { getLogger } from './safe-logger.js';
import { isSharedPlaceholderId } from './synthetic-user.js';

const log = getLogger();
const refusals = new Map<string, number>();

/** Whether `userId` is a shared placeholder, so the caller must skip the store; logs it counted. */
export function refusedPlaceholder(userId: string | undefined | null, site: string): boolean {
  if (!isSharedPlaceholderId(userId)) return false;
  const count = (refusals.get(site) ?? 0) + 1;
  refusals.set(site, count);
  if (/^10*$/.test(String(count))) {
    log.warn({ site, count }, 'Refused a store read or write under a shared placeholder id');
  }
  return true;
}
