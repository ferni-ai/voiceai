/**
 * Firestore stores a Date as a Timestamp and gives back the Timestamp, so a
 * value saved as a Date comes back as something `new Date(x)` turns into an
 * Invalid Date, which then fails the next save ("seconds is not a valid
 * integer"). Loaded data gets its Dates back, at any depth.
 */
export function timestampsToDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(timestampsToDates);
  if (!value || typeof value !== 'object') return value;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, timestampsToDates(v)]));
}
