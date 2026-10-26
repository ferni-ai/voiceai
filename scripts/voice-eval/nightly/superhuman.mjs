// The better-than-human bar: targets from superhuman-bar.json that no human friend reaches,
// scored over a night's runs with scorecard.mjs's metrics. MET / NOT MET / NO DATA per target and
// the change against the previous night. Report only: nothing here touches the exit code, so a
// noisy night never pages anyone; the trust gates in capabilities.json do that.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const round = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);

/** One row per target; dims 'all' expands to every judge dimension the night's verdicts carry. */
export function expandTargets(bar, runs) {
  return bar.targets.flatMap((t) => {
    if (t.dims !== 'all') return [t];
    const dims = [...new Set(runs.flatMap((r) => Object.keys(r.judge?.scores ?? {})))];
    return dims.map((dim) => ({ ...t, id: `${t.id}.${dim}`, label: `${t.label}: ${dim}`, dim }));
  });
}

const scopeOf = (t, runs, caps) => {
  if (t.scenariosOf) {
    const scenarios = caps.capabilities[t.scenariosOf]?.scenarios ?? [];
    return runs.filter((r) => scenarios.includes(r.scenario));
  }
  return runs.filter((r) => !(t.exceptScenarios ?? []).includes(r.scenario));
};

/** MET / NOT MET for a value, NO DATA for none. */
export function barVerdict(t, value) {
  if (value === null || value === undefined) return 'NO DATA';
  return (t.better === 'lower' ? value <= t.target : value >= t.target) ? 'MET' : 'NOT MET';
}

/** The bar over runs. metric is scorecard.mjs's; prev is an earlier bar result or null. */
export function scoreBar(runs, bar, caps, metric, extra = {}, prev = null) {
  const targets = expandTargets(bar, runs).map((t) => {
    const { value, n } = metric(t, scopeOf(t, runs, caps), caps, extra);
    const was = prev?.targets?.find((p) => p.id === t.id) ?? null;
    const prevValue = typeof was?.value === 'number' ? was.value : null;
    const delta = typeof value === 'number' && prevValue !== null ? round(value - prevValue) : null;
    const trend =
      delta === null
        ? null
        : delta === 0
          ? 'same'
          : (t.better === 'lower' ? delta < 0 : delta > 0)
            ? 'better'
            : 'worse';
    return {
      id: t.id,
      label: t.label,
      value: round(value),
      n,
      target: t.target,
      better: t.better,
      verdict: barVerdict(t, value),
      prev: prevValue,
      prevVerdict: was?.verdict ?? null,
      delta,
      trend,
      ...(value === null && t.needs ? { needs: t.needs } : {}),
    };
  });
  const met = targets.filter((t) => t.verdict === 'MET').length;
  return { met, of: targets.length, targets };
}

/** The previous night's bar: its own, or scored now from its runs when it predates the bar. */
export function prevBar(prev, score) {
  if (!prev) return null;
  if (prev.superhuman) return prev.superhuman;
  const dir = prev.file ? dirname(prev.file) : null;
  return dir && existsSync(join(dir, 'runs')) ? score(dir) : null;
}

export const loadBar = (file) => JSON.parse(readFileSync(file, 'utf8'));

const fmt = (v) => (v === null || v === undefined ? '-' : String(v));
const signed = (d) => (d > 0 ? `+${d}` : String(d));

/** The "Better than human" section of REPORT.md and COMMENT.md (numbers only, no run names). */
export function renderBar(sh) {
  if (!sh) return '';
  const rows = sh.targets.map((t) => {
    const bar = `${t.better === 'lower' ? '≤' : '≥'} ${t.target}`;
    const now =
      t.verdict === 'NO DATA' ? `no data${t.needs ? ` (needs ${t.needs})` : ''}` : fmt(t.value);
    const trend = t.delta === null ? '-' : `${signed(t.delta)} (${t.trend})`;
    return `| ${t.label} | ${now} | ${bar} | ${t.verdict} | ${fmt(t.prev)} | ${trend} |`;
  });
  return `\n## Better than human\n\n${sh.met} of ${sh.of} targets met (superhuman-bar.json). Report only: these never change the exit code.\n\n| Target | Now | Bar | Verdict | Last night | Trend |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
}
