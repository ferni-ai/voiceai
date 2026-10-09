/**
 * Which voice-eval users are safe to delete. Pure: no Firestore, no clock.
 *
 * run.sh names each call's user voice-eval-<scenario>-<YYYYMMDDHHMMSS>-<4 hex>
 * (local time). Older runs used fixed ids like voice-eval-v12-story-1; those
 * are "legacy" and only go when asked for. voice-eval-sam is the fixed user
 * run.sh still offers, so it is always kept.
 */

export const EVAL_PREFIX = 'voice-eval-';
export const ALWAYS_KEEP: ReadonlySet<string> = new Set(['voice-eval-sam']);

const GENERATED = /^voice-eval-(.+)-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-[0-9a-f]{4}$/;

export interface EvalUserSelection {
  /** Generated ids older than the minimum age. */
  generated: string[];
  /** Fixed ids from older runs, selected only with includeLegacy. */
  legacy: string[];
  /** Ids left alone, with the reason. */
  kept: Array<{ id: string; reason: 'always-kept' | 'too-recent' | 'legacy-not-included' }>;
}

/** The local start time encoded in a generated id, or null for any other id. */
export function generatedAt(id: string): Date | null {
  const m = GENERATED.exec(id);
  if (!m) return null;
  const [, , y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y as number, (mo as number) - 1, d, h, mi, s);
}

export function selectEvalUsers(
  ids: readonly string[],
  opts: { now: Date; minAgeMs: number; includeLegacy: boolean; keep?: readonly string[] }
): EvalUserSelection {
  const keep = new Set([...ALWAYS_KEEP, ...(opts.keep ?? [])]);
  const out: EvalUserSelection = { generated: [], legacy: [], kept: [] };
  for (const id of [...new Set(ids)].sort()) {
    if (!id.startsWith(EVAL_PREFIX)) continue;
    if (keep.has(id)) {
      out.kept.push({ id, reason: 'always-kept' });
      continue;
    }
    const at = generatedAt(id);
    if (at) {
      if (opts.now.getTime() - at.getTime() >= opts.minAgeMs) out.generated.push(id);
      else out.kept.push({ id, reason: 'too-recent' });
    } else if (opts.includeLegacy) {
      out.legacy.push(id);
    } else {
      out.kept.push({ id, reason: 'legacy-not-included' });
    }
  }
  return out;
}
