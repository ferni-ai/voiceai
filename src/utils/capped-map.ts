/**
 * Capped Map writes
 *
 * A module-level Map keyed per call or per session grows for as long as the
 * process lives when an end path forgets to delete. Writing through setCapped
 * bounds it: the Map keeps at most `max` keys, dropping the oldest by insertion
 * order. A key that is set again counts as the newest.
 *
 * @module utils/capped-map
 */

/**
 * Set `key` to `value` in `map`, then drop the oldest keys until `map` holds at
 * most `max`. Returns how many keys were dropped.
 */
export function setCapped<K, V>(map: Map<K, V>, key: K, value: V, max: number): number {
  map.delete(key); // a re-set key moves to the newest end
  map.set(key, value);
  let dropped = 0;
  for (const oldest of map.keys()) {
    if (map.size <= max) break;
    map.delete(oldest);
    dropped += 1;
  }
  return dropped;
}
