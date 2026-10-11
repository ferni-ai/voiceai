// Statistics for judge.mjs --summary: intervals that respect scenario
// clustering, Holm correction across dimensions, agreement between two judges,
// and a length-adjusted arm difference. No dependencies; seeded, so a summary
// prints the same numbers every time.

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => Math.sqrt(xs.reduce((a, x) => a + (x - mean(xs)) ** 2, 0) / (xs.length - 1));

/** FNV-1a hash of a string, for seeding. */
export function hashSeed(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded Fisher-Yates shuffle (returns a copy). */
export function shuffled(xs, seed) {
  const out = [...xs];
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** P(T <= t) for Student t with integer df (exact finite series; Abramowitz & Stegun 26.7.3-4). */
export function tCdf(t, df) {
  const th = Math.atan(Math.abs(t) / Math.sqrt(df));
  const c2 = Math.cos(th) ** 2;
  const odd = df % 2 === 1;
  let term = 1;
  let sum = 1;
  for (let k = 1; k <= (odd ? (df - 3) / 2 : (df - 2) / 2); k++) {
    term *= (odd ? (2 * k) / (2 * k + 1) : (2 * k - 1) / (2 * k)) * c2;
    sum += term;
  }
  const a = odd ? (2 / Math.PI) * (th + (df > 1 ? Math.sin(th) * Math.cos(th) * sum : 0)) : Math.sin(th) * sum;
  return t >= 0 ? 0.5 + a / 2 : 0.5 - a / 2;
}

/** The t value with P(T <= t) = p (bisection). */
export function tQuantile(p, df) {
  let [lo, hi] = [-1e4, 1e4];
  for (let i = 0; i < 200; i++) [lo, hi] = tCdf((lo + hi) / 2, df) < p ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
  return (lo + hi) / 2;
}

/** Two-sided p-value for a t statistic. */
export const tPValue = (t, df) => 2 * (1 - tCdf(Math.abs(t), df));

/** Below this many scenarios a cluster bootstrap has too few distinct resamples; use t over scenario means. */
export const MIN_BOOT_CLUSTERS = 10;

function groupBy(values, clusters) {
  const m = new Map();
  values.forEach((v, i) => m.set(clusters[i], [...(m.get(clusters[i]) ?? []), v]));
  return [...m.values()];
}

/**
 * Resample whole scenarios with replacement; return the sorted pooled means.
 * Calls in one scenario are not independent, so resampling calls one by one
 * would understate the uncertainty.
 */
export function clusterBootstrap(values, clusters, { B = 4000, seed = 1 } = {}) {
  const groups = groupBy(values, clusters);
  const r = rng(seed);
  const draws = [];
  for (let b = 0; b < B; b++) {
    const picked = groups.map(() => groups[Math.floor(r() * groups.length)]).flat();
    draws.push(mean(picked));
  }
  return draws.sort((a, b) => a - b);
}

/**
 * How a mean is estimated: cluster bootstrap with >= MIN_BOOT_CLUSTERS
 * scenarios; t over scenario means (df = scenarios - 1) with 2 or more; t over
 * calls with one scenario (method 't-unclustered', which ignores clustering).
 */
export function estimate(values, clusters, opts = {}) {
  const n = values.length;
  const groups = groupBy(values, clusters);
  const G = groups.length;
  if (G >= MIN_BOOT_CLUSTERS)
    return { mean: mean(values), n, G, method: 'cluster-bootstrap', draws: clusterBootstrap(values, clusters, opts) };
  const xs = G >= 2 ? groups.map(mean) : values;
  if (xs.length < 2) return { mean: n ? mean(values) : null, n, G, method: 'none' };
  const method = G >= 2 ? 'cluster-t' : 't-unclustered';
  return { mean: mean(xs), n, G, method, se: sd(xs) / Math.sqrt(xs.length), df: xs.length - 1 };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];

/** Two-sided (1 - alpha) interval for an estimate; nulls when there is none. */
export function intervalAt(est, alpha) {
  if (est.draws) return [quantile(est.draws, alpha / 2), quantile(est.draws, 1 - alpha / 2)];
  if (est.se === undefined) return [null, null];
  const h = tQuantile(1 - alpha / 2, est.df) * est.se;
  return [est.mean - h, est.mean + h];
}

/** Two-sided p-value for "the mean equals baseline"; null when it can't be computed. */
export function pValue(est, baseline) {
  if (est.draws) {
    const B = est.draws.length;
    const below = est.draws.filter((d) => d <= baseline).length;
    return Math.min(1, (2 * (Math.min(below, B - below) + 1)) / (B + 1));
  }
  if (est.se === undefined) return null;
  if (est.se === 0) return est.mean === baseline ? 1 : 0;
  return tPValue((est.mean - baseline) / est.se, est.df);
}

/** Holm step-down adjusted p-values for a { key: p } family (null stays null). */
export function holm(ps) {
  const sorted = Object.entries(ps)
    .filter(([, p]) => typeof p === 'number')
    .sort((a, b) => a[1] - b[1]);
  const out = Object.fromEntries(Object.keys(ps).map((k) => [k, null]));
  let running = 0;
  sorted.forEach(([k, p], i) => (out[k] = running = Math.max(running, Math.min(1, (sorted.length - i) * p))));
  return out;
}

/**
 * Test each dimension against a baseline (a number, or { dim: number }). The
 * pre-declared primary dimension is tested alone at alpha; the rest are one
 * Holm family, each shown with its interval at its Holm step's level so the
 * interval and the verdict agree.
 */
export function claimsTable(ests, { baseline = 3, primary = null, alpha = 0.05 } = {}) {
  const base = (k) => (typeof baseline === 'number' ? baseline : (baseline[k] ?? null));
  const p = {};
  for (const [k, e] of Object.entries(ests)) p[k] = base(k) === null ? null : pValue(e, base(k));
  const family = Object.fromEntries(Object.entries(p).filter(([k]) => k !== primary));
  const adj = holm(family);
  const order = Object.keys(family)
    .filter((k) => family[k] !== null)
    .sort((a, b) => family[a] - family[b]);
  return Object.entries(ests).map(([k, e]) => {
    const isPrimary = k === primary;
    const step = order.indexOf(k);
    const level = isPrimary || step < 0 ? alpha : alpha / (order.length - step);
    const pAdj = isPrimary ? p[k] : adj[k];
    const [lo, hi] = intervalAt(e, level);
    const verdict = pAdj === null || pAdj >= alpha ? '' : e.mean > base(k) ? 'above baseline' : 'BELOW baseline';
    const role = isPrimary ? 'primary' : 'exploratory';
    return { dim: k, role, mean: e.mean, n: e.n, G: e.G, method: e.method, lo, hi, level, p: p[k], pAdj, verdict };
  });
}

/** Ranks with ties given their average rank (1-based). */
export function ranks(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let i = 0, j = 0; i < idx.length; i = ++j) {
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) out[idx[k][1]] = (i + j) / 2 + 1;
  }
  return out;
}

/** Spearman rank correlation; null with fewer than 3 pairs or no variation. */
export function spearman(x, y) {
  if (x.length < 3) return null;
  const [rx, ry] = [ranks(x), ranks(y)];
  const [mx, my] = [mean(rx), mean(ry)];
  const dot = (a, ma, b, mb) => a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0);
  const vx = dot(rx, mx, rx, mx);
  const vy = dot(ry, my, ry, my);
  return vx && vy ? dot(rx, mx, ry, my) / Math.sqrt(vx * vy) : null;
}

/** Share of calls where two judges' rounded scores match exactly, and within one point. */
export function agreement(x, y) {
  const d = x.map((v, i) => Math.abs(Math.round(v) - Math.round(y[i])));
  const share = (f) => (d.length ? d.filter(f).length / d.length : null);
  return { n: d.length, exact: share((v) => v === 0), adjacent: share((v) => v <= 1) };
}

function invert(M) {
  const n = M.length;
  const A = M.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    const piv = A.slice(c).reduce((best, r, i) => (Math.abs(r[c]) > Math.abs(A[best][c]) ? c + i : best), c);
    if (Math.abs(A[piv][c]) < 1e-10) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    A[c] = A[c].map((v) => v / A[c][c]);
    for (let r = 0; r < n; r++) if (r !== c) A[r] = A[r].map((v, j) => v - A[r][c] * A[c][j]);
  }
  return A.map((row) => row.slice(n));
}

/** Ordinary least squares: coefficients, standard errors and residual df; null if singular or saturated. */
export function ols(y, X) {
  const p = X[0]?.length ?? 0;
  if (y.length <= p) return null;
  const col = (i) => X.map((r) => r[i]);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const inv = invert(X[0].map((_, i) => X[0].map((__, j) => dot(col(i), col(j)))));
  if (!inv) return null;
  const Xty = X[0].map((_, i) => dot(col(i), y));
  const beta = inv.map((row) => dot(row, Xty));
  const rss = y.reduce((a, yi, k) => a + (yi - dot(X[k], beta)) ** 2, 0);
  const s2 = rss / (y.length - p);
  return { beta, se: inv.map((row, i) => Math.sqrt(s2 * row[i])), df: y.length - p };
}

/**
 * Arm difference in score, raw (score ~ arm) and adjusted for reply length
 * (score ~ arm + log words), from rows { score, arm: 0|1, words }. LLM judges
 * favour longer answers, so an arm that talks more can win on length alone.
 * Simple OLS: its SEs ignore scenario clustering.
 */
export function lengthAdjusted(rows) {
  const ok = rows.filter((r) => typeof r.score === 'number' && r.words > 0);
  const y = ok.map((r) => r.score);
  const fit = (X) => {
    const f = ols(y, X);
    if (!f) return null;
    return { diff: f.beta[1], se: f.se[1], df: f.df, p: f.se[1] > 0 ? tPValue(f.beta[1] / f.se[1], f.df) : null };
  };
  return {
    n: ok.length,
    raw: fit(ok.map((r) => [1, r.arm])),
    adjusted: fit(ok.map((r) => [1, r.arm, Math.log(r.words)])),
  };
}
