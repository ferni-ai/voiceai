/**
 * Summaries as recall may use them: without what the caller disputed or what
 * only the assistant said. Moved out of session-recall.ts (which re-exports it).
 *
 * @module memory/recall/undisputed
 */

const LABELLED = ['disputedItems', 'assistantRaisedItems'];

/**
 * A summary without the items the caller disputed (dispute.ts: disputedItems) or that
 * only the assistant said (assistantRaisedItems), and without those lists, so no reader
 * serves or matches them.
 */
export function undisputed(s: Record<string, unknown>): Record<string, unknown> {
  const gone = new Set(LABELLED.flatMap((k) => (Array.isArray(s[k]) ? s[k].map(String) : [])));
  if (!LABELLED.some((k) => k in s)) return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (LABELLED.includes(k)) continue;
    out[k] = Array.isArray(v) ? v.filter((x) => typeof x !== 'string' || !gone.has(x)) : v;
  }
  return out;
}
