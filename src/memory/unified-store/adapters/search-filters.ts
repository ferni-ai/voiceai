/**
 * What a search's custom filters mean, for every adapter.
 *
 * A scalar filter value means equality. An array value means "has any of
 * these" (e.g. topics: memories about any of this turn's topics). Before,
 * Firestore got `where(field, '==', array)`, which only matches a memory whose
 * whole topic list equals this turn's (and needed an index that did not
 * exist, so every recall with topics failed), and the in-memory adapter
 * compared arrays by reference, so a topic filter never matched at all.
 *
 * @module memory/unified-store/adapters/search-filters
 */

/** Firestore allows at most this many values in one array-contains-any. */
export const MAX_ANY_VALUES = 10;

/** The array filter's values to match: deduplicated, capped; empty means no filter. */
export function anyValues(value: readonly unknown[]): unknown[] {
  return [...new Set(value)].slice(0, MAX_ANY_VALUES);
}

interface FilterableQuery<Q> {
  where(field: string, op: '==' | 'array-contains-any', value: unknown): Q;
}

/** Apply custom filters to a Firestore query. */
export function applyFilters<Q extends FilterableQuery<Q>>(
  query: Q,
  filters: Record<string, unknown> | undefined
): Q {
  for (const [field, value] of Object.entries(filters ?? {})) {
    if (Array.isArray(value)) {
      const values = anyValues(value);
      if (values.length > 0) query = query.where(field, 'array-contains-any', values);
    } else {
      query = query.where(field, '==', value);
    }
  }
  return query;
}

/** Whether an in-memory record passes the custom filters. */
export function matchesFilters(
  record: Record<string, unknown>,
  filters: Record<string, unknown> | undefined
): boolean {
  return Object.entries(filters ?? {}).every(([field, value]) => {
    if (!Array.isArray(value)) return record[field] === value;
    const values = anyValues(value);
    const actual = record[field];
    return values.length === 0 || (Array.isArray(actual) && values.some((v) => actual.includes(v)));
  });
}
