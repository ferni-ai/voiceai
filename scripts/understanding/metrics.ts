/**
 * Scoring for the turn-reading eval (eval.ts): per-field accuracy and
 * per-class precision/recall, each with a 95% Wilson interval, and latency
 * percentiles. Pure.
 */

export interface Rate {
  k: number;
  n: number;
  rate: number | null;
  ci: [number, number] | null;
}

/** k of n with its 95% Wilson score interval; null rate when n is 0. */
export function wilson(k: number, n: number, z = 1.96): Rate {
  if (n === 0) return { k, n, rate: null, ci: null };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { k, n, rate: r(p), ci: [r(Math.max(0, mid - half)), r(Math.min(1, mid + half))] };
}

/** Nearest-rank percentile (p in 0..100); null for no samples. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export interface FieldScore {
  accuracy: Rate;
  classes: Record<string, { precision: Rate; recall: Rate }>;
}

/** Accuracy and per-class precision/recall over (gold, predicted) pairs; a missing prediction is wrong. */
export function scoreField(pairs: Array<[unknown, unknown | undefined]>): FieldScore {
  const key = (v: unknown) => JSON.stringify(v);
  const classes = new Set(
    pairs.flatMap(([g, p]) => (p === undefined ? [key(g)] : [key(g), key(p)]))
  );
  const out: FieldScore['classes'] = {};
  for (const c of [...classes].sort()) {
    const tp = pairs.filter(([g, p]) => key(g) === c && p !== undefined && key(p) === c).length;
    const predicted = pairs.filter(([, p]) => p !== undefined && key(p) === c).length;
    const actual = pairs.filter(([g]) => key(g) === c).length;
    out[c] = { precision: wilson(tp, predicted), recall: wilson(tp, actual) };
  }
  const correct = pairs.filter(([g, p]) => p !== undefined && key(g) === key(p)).length;
  return { accuracy: wilson(correct, pairs.length), classes: out };
}
