#!/usr/bin/env node
// Release gate: every predicate over every call of a sweep (see README.md).
// usage: gate.mjs <sweep-dir>...   exits 1 when a gating predicate fails on any call.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSweep } from './predicates/call.mjs';
import { PREDICATES, runPredicates } from './predicates/index.mjs';

const SCENARIOS = fileURLToPath(new URL('./scenarios/', import.meta.url));
const scenarioText = (name, dir) => {
  const file = join(dir, `${name}.txt`);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

/** Real-risk scenarios may name 988: "crisis-real" in the name or "#@risk" in the file. */
export function isRiskScenario(name, dir = SCENARIOS) {
  return /crisis-real/.test(name) || /^#@risk\b/m.test(scenarioText(name, dir) ?? '');
}

/** The caller line a "#@disclose" comment marks: the next scripted line that is speech (run.sh
 *  skips "#" lines, so the marker sits on its own line above it). line counts scripted lines from
 *  1, as run.sh numbers t<i>.pcm; text is what the caller says. null: no marker, or nothing after. */
export function disclosureLine(text) {
  let marked = false;
  let line = 0;
  for (const raw of text.split('\n')) {
    const l = raw.replace(/\r$/, '');
    if (/^#@disclose\b/.test(l)) marked = true;
    if (!l.trim() || l.startsWith('#')) continue;
    line++;
    if (!marked || /^@(pause|data)\b/.test(l)) continue;
    const said = l
      .replace(/^@\w+ \d+ /, '')
      .replace(/\[\[[^\]]*\]\]/g, ' ')
      .trim();
    return said ? { line, text: said } : null;
  }
  return null;
}

/** A real-risk scenario's disclosure (disclosureLine of its file), or null. */
export const riskDisclosure = (name, dir = SCENARIOS) => {
  const text = scenarioText(name, dir);
  return text === null ? null : disclosureLine(text);
};

const choose = (n, k) =>
  Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce((a, b) => a * b, 1);
/** pass^k: the chance k fresh calls all pass, from c passing of n (tau-bench's C(c,k)/C(n,k)). */
export const passHatK = (c, n, k) => (k > n ? null : choose(c, k) / choose(n, k));

export function gateSweep(calls) {
  const rows = calls.map((call) => {
    call.risk ??= isRiskScenario(call.scenario);
    if (call.risk) call.disclose ??= riskDisclosure(call.scenario);
    const hits = runPredicates(call, calls);
    return { call, hits, gated: PREDICATES.every((p) => !p.gating || !hits[p.id].length) };
  });
  const scenarios = new Map();
  for (const r of rows)
    scenarios.set(r.call.scenario, [...(scenarios.get(r.call.scenario) ?? []), r]);
  return { rows, scenarios };
}

const pct = (x) => (x === null ? '-' : `${Math.round(x * 100)}%`).padStart(6);

export function formatGate({ rows, scenarios }, title) {
  const w = Math.max(8, ...[...scenarios.keys()].map((s) => s.length));
  const out = [
    `# ${title}: ${rows.length} calls, ${scenarios.size} scenarios`,
    PREDICATES.map((p, i) => `${i + 1}=${p.id}${p.gating ? '*' : ''}`).join(' '),
    `${'scenario'.padEnd(w)}  n${PREDICATES.map((_, i) => String(i + 1).padStart(5)).join('')}  pass^1 pass^3`,
  ];
  for (const [name, rs] of [...scenarios].sort()) {
    const cells = PREDICATES.map((p) => {
      const ok = rs.filter((r) => !r.hits[p.id].length).length;
      return (ok === rs.length ? '.' : `${ok}/${rs.length}`).padStart(5);
    });
    const [c, n] = [rs.filter((r) => r.gated).length, rs.length];
    out.push(
      `${name.padEnd(w)} ${String(n).padStart(2)}${cells.join('')} ${pct(passHatK(c, n, 1))} ${pct(passHatK(c, n, 3))}`
    );
  }
  out.push(
    `gating pass: ${rows.filter((r) => r.gated).length}/${rows.length} calls (* gating, . all pass)`
  );
  for (const { call, hits } of rows)
    for (const p of PREDICATES)
      for (const h of hits[p.id])
        out.push(
          `${p.gating ? 'FAIL' : 'warn'} ${p.id} ${call.scenario}-${call.label}: ${h.why}: "${h.quote.slice(0, 140)}"`
        );
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.error('usage: gate.mjs <sweep-dir>...');
    process.exit(2);
  }
  const results = dirs.map((dir) => [dir, gateSweep(loadSweep(dir))]);
  console.log(results.map(([dir, r]) => formatGate(r, dir)).join('\n\n'));
  process.exit(results.some(([, r]) => r.rows.some((x) => !x.gated)) ? 1 : 0);
}
