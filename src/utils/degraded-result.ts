/**
 * Degraded Result Helpers
 *
 * Standard shape for graceful degradation when DB/Redis/profile is unavailable.
 * Prefer this over silent `return []` so callers can observe and log soft failures.
 *
 * @module utils/degraded-result
 */

export interface DegradedMeta {
  readonly degraded: true;
  readonly reason: string;
}

export interface DegradedListResult<T> {
  readonly items: readonly T[];
  readonly _meta: DegradedMeta;
}

export interface DegradedObjectResult<T extends object> {
  readonly data: T;
  readonly _meta: DegradedMeta;
}

/**
 * Empty list with degradation metadata (replaces bare `return []`).
 */
export function degradedEmptyList<T = never>(reason: string): DegradedListResult<T> {
  return {
    items: [],
    _meta: { degraded: true, reason },
  };
}

/**
 * Empty object with degradation metadata (replaces bare `return {}`).
 */
export function degradedEmptyObject<T extends object = Record<string, never>>(
  reason: string,
  data: T = {} as T
): DegradedObjectResult<T> {
  return {
    data,
    _meta: { degraded: true, reason },
  };
}

/**
 * Type guard for degraded list results.
 */
export function isDegradedList<T>(
  value: unknown
): value is DegradedListResult<T> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const meta = record._meta;
  return (
    Array.isArray(record.items) &&
    typeof meta === 'object' &&
    meta !== null &&
    (meta as DegradedMeta).degraded === true
  );
}
