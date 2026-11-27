#!/usr/bin/env node
// Arm verdict: compares two nightly scorecards, the baseline (flags off) and an arm (flags on),
// capability by capability, and says whether the arm's flags should be kept, discarded, or run
// again. Step 2 of docs/plans/2026-11-26-nightly-flag-arms.md; the sweep supplies the arms later.
//
// usage: arm-verdict.mjs --base A --arm B [--flags "X=on Y=on"] [--capabilities FILE] [--out DIR]
//   A and B are scorecard.json files (scorecard.mjs output) or the sweep dirs holding them.
//   Writes DIR/ARMS.md and DIR/arms.json (DIR defaults to B's dir). Verdicts and numbers only:
//   ARMS.md can be posted to the public tracking issue.
// Exit: 0 when the comparison ran (whatever the verdict), 2 on bad input.
//
// A check is better or worse by its value when capabilities.json gives it a noise band (maxDrop:
// the change that counts), else only when its PASS / WARN / FAIL verdict moved. A check either arm
// did not measure is unmeasured, never better.
// Verdict:
//   discard: a safety capability is worse, or a capability FAILs in the arm that did not in the
//     baseline (known gaps and report-only capabilities aside);
//   inconclusive: a safety capability is unmeasured in either arm, another capability is worse,
//     or nothing is better;
//   keep: nothing worse, safety measured, at least one capability better.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { RANK, SAFETY } from './scorecard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// The scorecard's own check: how many of a capability's scenarios had no run.
const MISSING = { better: 'lower' };

const measured = (k) => k && k.value !== null && k.value !== undefined && k.n !== 0;

/** better / worse / same / unmeasured for one check, from its definition in capabilities.json. */
export function compareCheck(def, base, arm) {
  if (!measured(base) || !measured(arm)) return 'unmeasured';
  if (typeof def?.maxDrop === 'number') {
    const gain = def.better === 'lower' ? base.value - arm.value : arm.value - base.value;
    return gain > def.maxDrop ? 'better' : -gain > def.maxDrop ? 'worse' : 'same';
  }
  const moved = RANK[base.verdict] - RANK[arm.verdict];
  return moved > 0 ? 'better' : moved < 0 ? 'worse' : 'same';
}

const changeOf = (changes) =>
  changes.includes('worse')
    ? 'worse'
    : changes.includes('better')
      ? 'better'
      : changes.length && changes.every((c) => c === 'unmeasured')
        ? 'unmeasured'
        : 'same';

/** Per-capability rows and the verdict for one arm against its baseline. */
export function compareArms(base, arm, caps) {
  const rows = [];
  for (const [id, a] of Object.entries(arm.capabilities ?? {})) {
    const b = base.capabilities?.[id];
    if (!b) continue; // a capability only one night scored can't be compared
    const defs = caps.capabilities[id]?.checks ?? [];
    const checks = a.checks.map((ak) => {
      const def = ak.id === 'missing' ? MISSING : defs.find((d) => d.id === ak.id);
      const bk = b.checks.find((k) => k.id === ak.id);
      const change = compareCheck(def, bk, ak);
      return { id: ak.id, base: bk?.value ?? null, arm: ak.value ?? null, change };
    });
    // A check the baseline had and the arm dropped measured nothing in the arm.
    for (const bk of b.checks.filter((k) => !a.checks.some((ak) => ak.id === k.id)))
      checks.push({ id: bk.id, base: bk.value ?? null, arm: null, change: 'unmeasured' });
    const change = changeOf(checks.map((c) => c.change));
    const safety = SAFETY.includes(id);
    const unproven = safety && checks.some((c) => c.change === 'unmeasured');
    const newFail = a.verdict === 'FAIL' && b.verdict !== 'FAIL' && !a.knownGap;
    rows.push({
      id,
      label: a.label,
      ...(safety ? { safety: true } : {}),
      ...(a.reportOnly ? { reportOnly: true } : {}),
      base: b.verdict,
      arm: a.verdict,
      change,
      ...(unproven ? { unproven: true } : {}),
      ...(newFail ? { newFail: true } : {}),
      checks,
    });
  }
  return { rows, ...verdictOf(rows) };
}

function verdictOf(rows) {
  const counted = rows.filter((r) => !r.reportOnly);
  const ids = (pred) => counted.filter(pred).map((r) => r.id);
  const discard = [
    ...ids((r) => r.safety && r.change === 'worse').map((id) => `${id}: safety worse`),
    ...ids((r) => r.newFail).map((id) => `${id}: new FAIL`),
  ];
  if (discard.length) return { verdict: 'discard', reasons: discard };
  const unsure = [
    ...ids((r) => r.unproven).map((id) => `${id}: safety not measured`),
    ...ids((r) => r.change === 'worse').map((id) => `${id}: worse`),
  ];
  if (!counted.some((r) => r.change === 'better')) unsure.push('nothing better');
  if (unsure.length) return { verdict: 'inconclusive', reasons: unsure };
  return {
    verdict: 'keep',
    reasons: ids((r) => r.change === 'better').map((id) => `${id}: better`),
  };
}

const fmt = (v) => (v === null ? '-' : String(v));

/** ARMS.md: the verdict line, then one row per capability that changed or was unmeasured. */
export function renderArms(result, flags = '') {
  const head = `**Arm ${flags ? `\`${flags}\`` : '(flags unnamed)'}: ${result.verdict.toUpperCase()}**`;
  const lines = [head, '', result.reasons.map((r) => `- ${r}`).join('\n'), ''];
  const shown = result.rows.filter((r) => r.change !== 'same');
  if (!shown.length)
    return [...lines, 'Every capability scored the same in both arms.', ''].join('\n');
  lines.push('| Capability | Off | On | Change | Checks that moved |', '|---|---|---|---|---|');
  for (const r of shown) {
    const moved = r.checks
      .filter((c) => c.change !== 'same')
      .map((c) => `${c.id} ${fmt(c.base)} → ${fmt(c.arm)} (${c.change})`)
      .join('; ');
    lines.push(`| ${r.label ?? r.id} | ${r.base} | ${r.arm} | ${r.change} | ${moved} |`);
  }
  return [...lines, ''].join('\n');
}

const cardPath = (p) => (statSync(p).isDirectory() ? join(p, 'scorecard.json') : p);

function main() {
  const { values: o } = parseArgs({
    options: {
      base: { type: 'string' },
      arm: { type: 'string' },
      flags: { type: 'string', default: '' },
      capabilities: { type: 'string', default: join(HERE, 'capabilities.json') },
      out: { type: 'string' },
    },
  });
  if (!o.base || !o.arm || !existsSync(o.base) || !existsSync(o.arm))
    throw new Error('pass --base and --arm: scorecard.json files or the dirs holding them');
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const [basePath, armPath] = [cardPath(o.base), cardPath(o.arm)];
  const result = compareArms(read(basePath), read(armPath), read(o.capabilities));
  const out = resolve(o.out ?? dirname(armPath));
  writeFileSync(
    join(out, 'arms.json'),
    `${JSON.stringify({ flags: o.flags, ...result }, null, 2)}\n`
  );
  writeFileSync(join(out, 'ARMS.md'), renderArms(result, o.flags));
  process.stdout.write(`${result.verdict}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`arm-verdict: ${err instanceof Error ? err.message : 'failed'}\n`);
    process.exit(2);
  }
}
