/**
 * The shape of a tool call's arguments, for logs: each key with its type, and a
 * string's length. Never a value: tool arguments carry what the caller said (a
 * loss, a craving, a search, a name), and the dispatcher logs every call for
 * every user, demo visitors included.
 *
 * @module agents/shared/tool-arg-shape
 */

const MAX_KEYS = 20;

/** `{ query: 'string:42', limit: 'number', tags: 'array:3' }` for a tool's args. */
export function toolArgShape(args: unknown): Record<string, string> | string {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return typeOf(args);
  const shape: Record<string, string> = {};
  const keys = Object.keys(args);
  for (const key of keys.slice(0, MAX_KEYS)) {
    shape[key] = typeOf((args as Record<string, unknown>)[key]);
  }
  if (keys.length > MAX_KEYS) shape['…'] = `+${keys.length - MAX_KEYS} keys`;
  return shape;
}

function typeOf(value: unknown): string {
  if (typeof value === 'string') return `string:${value.length}`;
  if (Array.isArray(value)) return `array:${value.length}`;
  if (value === null) return 'null';
  return typeof value;
}
