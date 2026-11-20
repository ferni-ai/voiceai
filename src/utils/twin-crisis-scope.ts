/**
 * The Digital Twin's typed crisis scopes, as the crisis stores see them.
 *
 * A twin conversation reads crisis the way a call does, under a scope of its own: an opaque
 * key with a fixed prefix, never the person's id. A flood of typed messages must never cost
 * a live call its crisis state, so the stores that cap their size (crisis-memory-hold.ts,
 * crisis-confirmed-risk.ts) drop twin scopes first, oldest first, and never drop a call to
 * make room for one. The turn reads and the ledger also keep at most TWIN_SCOPES_MAX twin
 * scopes. A live memory hold is never dropped, a twin's included. Logs name a twin scope
 * only as `{ scope: 'twin' }`.
 *
 * @module utils/twin-crisis-scope
 */
import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'twin-crisis-scope' });

const TWIN_SCOPE_PREFIX = 'twin-crisis:';
/** Twin scopes the turn reads and the ledger keep; the oldest go beyond it. */
const TWIN_SCOPES_MAX = 1000;

const isTwinScope = (id: string): boolean => id.startsWith(TWIN_SCOPE_PREFIX);

/** How a crisis store's log names a scope: never by a twin's key. */
export const loggedScope = (id: string): { sessionId: string } | { scope: 'twin' } =>
  isTwinScope(id) ? { scope: 'twin' } : { sessionId: id };

export interface TwinFirstTrim {
  /** The store's size cap. */
  max: number;
  /** The key just written (the map's newest). */
  inserted: string;
  /** May go to bring the store back under max. */
  droppable: (id: string) => boolean;
  /** Twin scopes beyond TWIN_SCOPES_MAX go too, oldest first, droppable or not. */
  capTwins: boolean;
  /** The store's name in the twin_scope_evicted log. */
  store: string;
}

/**
 * Make room in a capped crisis store (Map order is oldest first). Over max, droppable twin
 * scopes go first; calls go only when a call was written, as they did before twin scopes.
 */
export function trimTwinFirst<V>(map: Map<string, V>, trim: TwinFirstTrim): void {
  const { max, inserted, droppable } = trim;
  const evicted = trim.capTwins ? capTwinScopes(map, inserted) : 0;
  for (const id of map.keys()) {
    if (map.size <= max) break;
    if (isTwinScope(id) && id !== inserted && droppable(id)) map.delete(id);
  }
  if (!isTwinScope(inserted)) {
    for (const id of map.keys()) {
      if (map.size <= max) break;
      if (!isTwinScope(id) && droppable(id)) map.delete(id);
    }
  }
  if (evicted > 0) log.warn({ store: trim.store, evicted }, 'twin_scope_evicted');
}

/** Drop the oldest twin scopes beyond TWIN_SCOPES_MAX; how many went. */
function capTwinScopes<V>(map: Map<string, V>, inserted: string): number {
  const twins = [...map.keys()].filter((id) => isTwinScope(id) && id !== inserted);
  const over = twins.length + (isTwinScope(inserted) ? 1 : 0) - TWIN_SCOPES_MAX;
  for (const id of twins.slice(0, Math.max(0, over))) map.delete(id);
  return Math.max(0, over);
}
