/**
 * Server copies of things this browser keeps in localStorage, so they follow the person
 * to a new device (src/api/routes/synced-items.ts, /api/synced/:kind).
 *
 * Writes go through as they happen. On load, `pullAndMerge` reads the server's list and
 * merges it with the local one: the newer copy of an item wins (server on a tie), a
 * server deletion removes the local copy unless the local copy changed after it, and
 * anything only this browser has, or has newer, is sent up.
 */

import { apiDelete, apiGet, apiPut, getUserId } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SyncedItems');

export type SyncedKind = 'rituals' | 'marketplace-installs';

interface SyncedList<T> {
  items: T[];
  deleted: Array<{ id: string; deletedAt: string }>;
}

const time = (iso: string | undefined): number => Date.parse(iso ?? '') || 0;

/** Save one item on the server. Failures are logged; the next load sends it again. */
export async function saveSynced(kind: SyncedKind, id: string, item: unknown, updatedAt: string) {
  if (!getUserId()) return;
  const res = await apiPut(`/api/synced/${kind}/${encodeURIComponent(id)}`, { item, updatedAt });
  if (!res.ok) log.debug('Server copy not saved; next load sends it', { kind, id, status: res.status });
}

/** Remove one item on the server, for every device. */
export async function deleteSynced(kind: SyncedKind, id: string) {
  if (!getUserId()) return;
  const res = await apiDelete(`/api/synced/${kind}/${encodeURIComponent(id)}`);
  if (!res.ok) log.debug('Server copy not removed', { kind, id, status: res.status });
}

/**
 * The local items merged with the server's, or null when the server couldn't be read
 * (keep the local list as it is). Items this browser has newer are sent up.
 */
export async function pullAndMerge<T extends { id: string }>(
  kind: SyncedKind,
  local: ReadonlyMap<string, T>,
  stamp: (item: T) => string
): Promise<Map<string, T> | null> {
  if (!getUserId()) return null;
  const res = await apiGet<SyncedList<T>>(`/api/synced/${kind}`);
  if (!res.ok || !res.data || !Array.isArray(res.data.items)) return null;

  const merged = new Map(local);
  const onServer = new Set<string>();
  for (const remote of res.data.items) {
    if (!remote || typeof remote.id !== 'string') continue;
    onServer.add(remote.id);
    const mine = merged.get(remote.id);
    if (!mine || time(stamp(remote)) >= time(stamp(mine))) merged.set(remote.id, remote);
    else void saveSynced(kind, mine.id, mine, stamp(mine));
  }
  for (const { id, deletedAt } of res.data.deleted ?? []) {
    onServer.add(id);
    const mine = merged.get(id);
    if (!mine) continue;
    if (time(stamp(mine)) <= time(deletedAt)) merged.delete(id);
    else void saveSynced(kind, id, mine, stamp(mine));
  }
  for (const mine of merged.values()) {
    if (!onServer.has(mine.id)) void saveSynced(kind, mine.id, mine, stamp(mine));
  }
  return merged;
}
