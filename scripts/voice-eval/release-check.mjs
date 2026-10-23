#!/usr/bin/env node
// Release check: prove a candidate build on an env that already runs it, paired against the last
// release on the same scenarios (README.md "Checking a release"). It deploys nothing and calls
// nobody: it reads sweep run files and the agent's Cloud Logging lines.
// usage: release-check.mjs <dev|prod> <candidate-sha> <baseline-sha> --candidate DIR[,DIR]
//          --baseline DIR[,DIR] [--out FILE] [--logs DIR] [--allow-unstamped-baseline]
//          [--offline] [--dry-run] [--seed S]
// Exit: 0 PASS (not yet a release gate: see README), 1 FAIL, 3 INCONCLUSIVE (don't promote on this evidence), 2 harness
// error, 4 dry run (nothing was checked).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatGate, gateSweep } from './gate.mjs';
import { MIN_BOOT_CLUSTERS } from './judge-stats.mjs';
import { formatPaired, pairedCompare, sweepValues } from './paired.mjs';
import { loadSweep } from './predicates/call.mjs';
import { deadGates } from './predicates/canaries.mjs';
import { PREDICATES } from './predicates/index.mjs';

export const AGENTS = { dev: 'CA_siTDMHEba4Fg', prod: 'CA_GeFvEpsNXLSF' };
const GCP = 'johnb-2025';
/** Pre-registered primary metrics (research move 9). margin: the worst change still "no worse". */
export const PRIMARY = [
  { metric: 'gate', better: 'higher', margin: 0.1 }, // share of calls passing every gate
  { metric: 'replyGapMedMs', better: 'lower', margin: 300 }, // median REPLY gap per call, ms
];
const BOOT_LOOKBACK_MS = 48 * 3600e3;
const CALL_TAIL_MS = 20 * 60e3;
const BOOT_SLACK_MS = 60e3;
export const EXIT = { PASS: 0, FAIL: 1, INCONCLUSIVE: 3, DRY_RUN: 4 };

/** Cloud Logging filters covering these calls: worker boot lines (commit) and eval-room lines. */
export function logFilters(agent, calls) {
  const t = calls.map((c) => c.wallT0).filter((x) => x > 0);
  if (!t.length) return null;
  const iso = (ms) => new Date(ms).toISOString();
  const [t0, t1] = [Math.min(...t), Math.max(...t) + CALL_TAIL_MS];
  const base = `logName="projects/${GCP}/logs/cloud-agents" AND labels.agent_id="${agent}"`;
  const span = (from) => `timestamp>="${iso(from)}" AND timestamp<="${iso(t1)}"`;
  return {
    boot: `${base} AND textPayload:"EFFECTIVE_SETTINGS" AND ${span(t0 - BOOT_LOOKBACK_MS)}`,
    rooms: `${base} AND textPayload:"\\"roomName\\":\\"eval-" AND ${span(t0 - 60e3)}`,
  };
}

/** The --logs cache file for one query: a different window or agent never reuses it. */
const sha12 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
export const cacheFile = (dir, side, kind, f) => join(dir, `${side}-${kind}-${sha12(f)}.json`);

/** Which commit served each call: for every worker that logged the call's room, the commit on its
 *  latest boot line before the call. status: ok (all the expected sha), other (a different
 *  commit), unstamped (booted with commit "unknown", before .build-sha), unproven (no lines). */
export function provenance(calls, boot, rooms, sha) {
  const boots = new Map();
  for (const e of boot) {
    const c = (e.textPayload ?? '').match(/"commit":"([^"]+)"/)?.[1];
    const w = e.labels?.worker_id;
    if (c) boots.set(w, [...(boots.get(w) ?? []), [Date.parse(e.timestamp), c]]);
  }
  const workers = new Map();
  for (const e of rooms) {
    const room = (e.textPayload ?? '').match(/"roomName":"([^"]+)"/)?.[1];
    if (room) workers.set(room, new Set([...(workers.get(room) ?? []), e.labels?.worker_id]));
  }
  const known = (c) => /^[0-9a-f]{7,40}$/.test(c);
  const same = (c) => c.startsWith(sha) || sha.startsWith(c);
  return calls.map((call) => {
    const before = (w) =>
      (boots.get(w) ?? [])
        .filter(([t]) => !(t > call.wallT0 + BOOT_SLACK_MS))
        .sort((a, b) => a[0] - b[0])
        .at(-1)?.[1] ?? 'no boot line';
    const commits = [...new Set([...(workers.get(call.room) ?? [])].map(before))];
    const status = commits.some((c) => known(c) && !same(c))
      ? 'other'
      : commits.length && commits.every((c) => known(c) || c === 'unknown')
        ? commits.some((c) => c === 'unknown')
          ? 'unstamped'
          : 'ok'
        : 'unproven';
    const name = `${call.scenario}-${call.label}`;
    return { call: name, status, commits: commits.length ? commits : ['no log lines'] };
  });
}

const count = (prov, s) => prov.filter((p) => p.status === s).length;
function provenanceItem(side, prov, sha, allowUnstamped) {
  const name = `provenance ${side} ${sha}`;
  if (!prov) return { name, verdict: 'INCONCLUSIVE', why: 'skipped (--offline or no call times)' };
  const n = (s) => count(prov, s);
  const why = `${n('ok')}/${prov.length} calls served by it, ${n('other')} by another commit, ${n('unstamped')} unstamped, ${n('unproven')} with no log lines`;
  if (n('other')) return { name, verdict: 'INCONCLUSIVE', why: `${why}: measured the wrong build` };
  if (n('unproven')) return { name, verdict: 'INCONCLUSIVE', why };
  const flag = '--allow-unstamped-baseline';
  if (n('unstamped') && !(side === 'baseline' && allowUnstamped))
    return {
      name,
      verdict: 'INCONCLUSIVE',
      why: `${why}; a pre-.build-sha baseline needs ${flag}`,
    };
  if (n('unstamped')) return { name, verdict: 'NOTE', why: `${why} (${flag})` };
  return { name, verdict: 'PASS', why };
}

/** One primary metric's verdict from its paired row (diff = candidate - baseline). */
export function judgePrimary(spec, row) {
  const name = `primary ${spec.metric}`;
  if (!row) return { name, verdict: 'INCONCLUSIVE', why: 'no shared scenario measured it' };
  const [lo, hi] = row.ci;
  const up = spec.better === 'higher';
  const rule = `${up ? 'lower' : 'upper'} CI bound ${up ? '>=' : '<='} ${up ? -spec.margin : spec.margin}`;
  const at = `diff ${row.diff.toFixed(3)} [${lo.toFixed(3)}, ${hi.toFixed(3)}] over ${row.scenarios} scenarios`;
  if (row.scenarios < MIN_BOOT_CLUSTERS) {
    const why = `${at}: under ${MIN_BOOT_CLUSTERS} scenarios the CI runs narrow`;
    return { name, verdict: 'INCONCLUSIVE', why };
  }
  if (up ? lo >= -spec.margin : hi <= spec.margin) {
    const worse = up ? row.diff < 0 : row.diff > 0;
    const note = worse ? `worse by ${Math.abs(row.diff).toFixed(3)}, within the margin` : null;
    return { name, verdict: 'PASS', why: `${at}: no worse (${rule})`, note };
  }
  if (up ? hi < 0 : lo > 0)
    return { name, verdict: 'FAIL', why: `${at}: credibly worse (CI excludes 0)` };
  return { name, verdict: 'INCONCLUSIVE', why: `${at}: too wide to show ${rule}` };
}

/** Every item and the overall verdict: any FAIL fails, then any INCONCLUSIVE; NOTE never counts.
 *  Gating predicates are absolute over every candidate call (predicates/index.mjs, gate.mjs). */
export function checkRelease(ev) {
  const { gateRows, rows, provCandidate, provBaseline, candidate, baseline } = ev;
  const items = [
    provenanceItem('candidate', provCandidate, candidate),
    provenanceItem('baseline', provBaseline, baseline, ev.allowUnstamped),
  ];
  const missing = ev.missingScenarios ?? [];
  const cover = `${missing.length} of ${ev.baselineScenarios ?? 0} baseline scenarios missing`;
  items.push(
    missing.length
      ? { name: 'coverage', verdict: 'INCONCLUSIVE', why: `${cover}: ${missing.join(', ')}` }
      : { name: 'coverage', verdict: 'PASS', why: cover }
  );
  const skipped = ev.skipped ?? [];
  if (skipped.length)
    items.push({
      name: 'run files',
      verdict: 'INCONCLUSIVE',
      why: `not run files (unparseable, or no meta or events): ${skipped.join(', ')}`,
    });
  for (const p of PREDICATES.filter((x) => x.gating)) {
    const n = gateRows.filter((r) => r.hits[p.id].length).length;
    const why = `${n}/${gateRows.length} candidate calls`;
    items.push({ name: `gate ${p.id}`, verdict: n ? 'FAIL' : 'PASS', why });
  }
  for (const spec of PRIMARY) {
    const j = judgePrimary(
      spec,
      rows.find((r) => r.metric === spec.metric)
    );
    items.push(j);
    if (j.note) items.push({ name: j.name, verdict: 'NOTE', why: j.note });
  }
  const has = (v) => items.some((i) => i.verdict === v);
  return { items, verdict: has('FAIL') ? 'FAIL' : has('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS' };
}

function readLogs(dir, side, agent, calls, dry, say) {
  const f = logFilters(agent, calls);
  if (!f) return null;
  const out = {};
  for (const [k, filter] of Object.entries(f)) {
    const file = cacheFile(dir, side, k, filter);
    const args = ['logging', 'read', filter, '--project', GCP, '--format', 'json'];
    if (dry)
      say(`would read ${side} ${k}: gcloud ${args.slice(0, 2).join(' ')} '${filter}' > ${file}`);
    else {
      if (!existsSync(file))
        writeFileSync(file, execFileSync('gcloud', args, { encoding: 'utf8', maxBuffer: 1 << 30 }));
      out[k] = JSON.parse(readFileSync(file, 'utf8'));
    }
  }
  return dry ? null : out;
}

const USAGE =
  'usage: release-check.mjs <dev|prod> <candidate-sha> <baseline-sha> --candidate DIR[,DIR] --baseline DIR[,DIR] [--out FILE] [--logs DIR] [--allow-unstamped-baseline] [--offline] [--dry-run] [--seed S]';
const BOOL = ['--offline', '--dry-run', '--allow-unstamped-baseline'];

function main(argv, say) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++)
    if (BOOL.includes(argv[i])) flags[argv[i]] = true;
    else if (argv[i].startsWith('--')) flags[argv[i]] = argv[++i];
    else pos.push(argv[i]);
  const [env, candidate, baseline] = pos;
  const agent = AGENTS[env];
  if (!agent || !flags['--candidate'] || !flags['--baseline']) throw new Error(USAGE);
  const sha = /^[0-9a-f]{7,40}$/;
  if (!sha.test(candidate ?? '') || !sha.test(baseline ?? ''))
    throw new Error(`SHAs must be 7-40 hex characters: ${candidate}, ${baseline}`);
  if (candidate.startsWith(baseline) || baseline.startsWith(candidate))
    throw new Error(`the candidate and the baseline are the same commit: ${candidate}`);
  const dirs = (k) => flags[k].split(',');
  const sweeps = (k) => dirs(k).map((d) => loadSweep(d));
  const [cSweeps, bSweeps] = [sweeps('--candidate'), sweeps('--baseline')];
  const [cCalls, bCalls] = [cSweeps.flat(), bSweeps.flat()];
  if (!cCalls.length || !bCalls.length)
    throw new Error('no run files in the candidate or baseline dirs');
  const dead = deadGates();
  if (dead.length)
    throw new Error(`self-test: a gate can't go red, so it proves nothing: ${dead.join('; ')}`);
  say(`# release-check ${env}: candidate ${candidate} vs baseline ${baseline} (deploys nothing)`);
  say(`self-test: every gating predicate fails its canary\n`);

  const dry = flags['--dry-run'];
  let prov = [null, null];
  if (!flags['--offline']) {
    const logs = flags['--logs'] ?? mkdtempSync(join(tmpdir(), 'release-check-'));
    mkdirSync(logs, { recursive: true });
    const read = (side, calls, s) => {
      const l = readLogs(logs, side, agent, calls, dry, say);
      return l && provenance(calls, l.boot, l.rooms, s);
    };
    prov = [read('candidate', cCalls, candidate), read('baseline', bCalls, baseline)];
    if (dry) return EXIT.DRY_RUN;
    say(
      `## Provenance: Cloud Logging cloud-agents, agent ${agent}, project ${GCP} (logs in ${logs})`
    );
    ['candidate', 'baseline'].forEach((side, i) => {
      const bad = (prov[i] ?? []).filter((x) => x.status !== 'ok');
      for (const p of bad.slice(0, 6))
        say(`${side} ${p.status.padEnd(9)} ${p.call}: ${p.commits.join(', ')}`);
      if (bad.length > 6) say(`${side} ... ${bad.length - 6} more not ok`);
    });
  }

  say('\n## Candidate gate');
  const gates = dirs('--candidate').map((d, i) => [d, gateSweep(cSweeps[i])]);
  say(gates.map(([d, g]) => formatGate(g, d)).join('\n\n'));

  const values = (k) => dirs(k).flatMap((d) => sweepValues(d));
  const seed = flags['--seed'] === undefined ? undefined : Number(flags['--seed']);
  const isPrimary = (m) => PRIMARY.some((p) => p.metric === m);
  const rows = pairedCompare(values('--baseline'), values('--candidate'), { seed });
  const shown = [
    ...rows.filter((r) => isPrimary(r.metric)),
    ...rows.filter((r) => !isPrimary(r.metric)),
  ];
  say(
    '\n## Paired: candidate - baseline over shared scenarios (* primary, the rest reported only)'
  );
  say(
    formatPaired(
      shown.map((r) => ({ ...r, metric: `${isPrimary(r.metric) ? '*' : ' '}${r.metric}` }))
    )
  );

  const cScen = new Set(cCalls.map((c) => c.scenario));
  const bScen = [...new Set(bCalls.map((c) => c.scenario))].sort();
  const res = checkRelease({
    gateRows: gates.flatMap(([, g]) => g.rows),
    rows,
    provCandidate: prov[0],
    provBaseline: prov[1],
    candidate,
    baseline,
    allowUnstamped: flags['--allow-unstamped-baseline'],
    missingScenarios: bScen.filter((s) => !cScen.has(s)),
    baselineScenarios: bScen.length,
    skipped: [...cSweeps, ...bSweeps].flatMap((s) => s.skipped ?? []),
  });
  say('\n## Verdict');
  for (const i of res.items) say(`${i.verdict.padEnd(12)} ${i.name}: ${i.why}`);
  say(`RESULT_release_check=${res.verdict}`);
  return EXIT[res.verdict];
}

// Real paths: a symlinked argv[1] would skip main() and exit 0, a silent PASS (as scorecard.mjs).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
  const lines = [];
  const say = (l) => {
    console.log(l);
    lines.push(l);
  };
  let code;
  try {
    code = main(argv, say);
  } catch (e) {
    console.error(`release-check: ${e.message}`);
    lines.push(`release-check: ${e.message}`);
    code = 2;
  }
  // The report file carries the result itself: piping through tee would hide the exit code.
  if (out) writeFileSync(out, `${lines.join('\n')}\nexit ${code}\n`);
  process.exit(code);
}
