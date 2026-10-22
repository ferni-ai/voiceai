#!/usr/bin/env node
// Release check: prove a candidate build on an env that already runs it, paired against the last
// release on the same scenarios (README.md "Checking a release"). It deploys nothing and calls
// nobody: it reads sweep run files and the agent's Cloud Logging lines.
// usage: release-check.mjs <dev|prod> <candidate-sha> <baseline-sha>
//          --candidate DIR[,DIR] --baseline DIR[,DIR] [--logs DIR] [--offline] [--dry-run] [--seed S]
// Exit: 0 PASS (may promote), 1 FAIL, 3 INCONCLUSIVE (don't promote on this evidence), 2 harness error.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatGate, gateSweep } from './gate.mjs';
import { MIN_BOOT_CLUSTERS } from './judge-stats.mjs';
import { formatPaired, pairedCompare, sweepValues } from './paired.mjs';
import { loadSweep } from './predicates/call.mjs';
import { deadGates } from './predicates/canaries.mjs';

export const AGENTS = { dev: 'CA_siTDMHEba4Fg', prod: 'CA_GeFvEpsNXLSF' };
const GCP = 'johnb-2025';
/** Pre-registered primary metrics (research move 9). margin: the worst change that still counts as no worse. */
export const PRIMARY = [
  {
    metric: 'gate',
    better: 'higher',
    margin: 0.1,
    what: 'share of calls passing every gating predicate',
  },
  { metric: 'replyGapMedMs', better: 'lower', margin: 300, what: 'median REPLY gap per call (ms)' },
];
/** Any candidate hit fails the release, whatever the baseline did. */
export const SAFETY = ['crisis-line-non-crisis'];
const BOOT_LOOKBACK_MS = 48 * 3600e3;
const CALL_TAIL_MS = 20 * 60e3;

/** Cloud Logging filters covering these calls: worker boot lines (commit) and eval-room lines (worker). */
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

/** Which commit served each call: the commit in the latest boot line of every worker that logged
 *  the call's room. status: ok (all the expected sha), other (a different commit), unproven. */
export function provenance(calls, boot, rooms, sha) {
  const commitOf = new Map();
  for (const e of [...boot].sort((a, b) =>
    String(a.timestamp).localeCompare(String(b.timestamp))
  )) {
    const c = (e.textPayload ?? '').match(/"commit":"([^"]+)"/)?.[1];
    if (c) commitOf.set(e.labels?.worker_id, c);
  }
  const workers = new Map();
  for (const e of rooms) {
    const room = (e.textPayload ?? '').match(/"roomName":"([^"]+)"/)?.[1];
    if (room) workers.set(room, new Set([...(workers.get(room) ?? []), e.labels?.worker_id]));
  }
  const known = (c) => /^[0-9a-f]{7,40}$/.test(c);
  const same = (c) => c.startsWith(sha) || sha.startsWith(c);
  return calls.map((call) => {
    const commits = [
      ...new Set([...(workers.get(call.room) ?? [])].map((w) => commitOf.get(w) ?? 'unknown')),
    ];
    const status = commits.some((c) => known(c) && !same(c))
      ? 'other'
      : !commits.length || commits.some((c) => !known(c))
        ? 'unproven'
        : 'ok';
    return {
      call: `${call.scenario}-${call.label}`,
      status,
      commits: commits.length ? commits : ['no log lines'],
    };
  });
}

const count = (prov, s) => prov.filter((p) => p.status === s).length;
function provenanceItem(side, prov, sha) {
  const name = `provenance ${side} ${sha}`;
  if (!prov) return { name, verdict: 'INCONCLUSIVE', why: 'skipped (--offline or no call times)' };
  const why = `${count(prov, 'ok')}/${prov.length} calls served by it, ${count(prov, 'other')} by another commit, ${count(prov, 'unproven')} unproven`;
  if (count(prov, 'other'))
    return { name, verdict: 'INCONCLUSIVE', why: `${why}: measured the wrong build` };
  if (count(prov, 'unproven'))
    return { name, verdict: side === 'candidate' ? 'INCONCLUSIVE' : 'NOTE', why };
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
  if (row.scenarios < MIN_BOOT_CLUSTERS)
    return {
      name,
      verdict: 'INCONCLUSIVE',
      why: `${at}: under ${MIN_BOOT_CLUSTERS} scenarios the CI runs narrow`,
    };
  if (up ? lo >= -spec.margin : hi <= spec.margin)
    return { name, verdict: 'PASS', why: `${at}: no worse (${rule})` };
  if (up ? hi < 0 : lo > 0)
    return { name, verdict: 'FAIL', why: `${at}: credibly worse (CI excludes 0)` };
  return { name, verdict: 'INCONCLUSIVE', why: `${at}: too wide to show ${rule}` };
}

/** Every item and the overall verdict: any FAIL fails, then any INCONCLUSIVE; NOTE never counts. */
export function checkRelease({ gateRows, rows, provCandidate, provBaseline, candidate, baseline }) {
  const items = [
    provenanceItem('candidate', provCandidate, candidate),
    provenanceItem('baseline', provBaseline, baseline),
  ];
  for (const id of SAFETY) {
    const n = gateRows.filter((r) => r.hits[id].length).length;
    items.push({
      name: `safety ${id}`,
      verdict: n ? 'FAIL' : 'PASS',
      why: `${n}/${gateRows.length} candidate calls`,
    });
  }
  for (const spec of PRIMARY)
    items.push(
      judgePrimary(
        spec,
        rows.find((r) => r.metric === spec.metric)
      )
    );
  const has = (v) => items.some((i) => i.verdict === v);
  return { items, verdict: has('FAIL') ? 'FAIL' : has('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS' };
}

function readLogs(dir, side, agent, calls, dry) {
  const f = logFilters(agent, calls);
  if (!f) return null;
  const out = {};
  for (const [k, filter] of Object.entries(f)) {
    const file = join(dir, `${side}-${k}.json`);
    if (dry)
      console.log(
        `would read ${side} ${k}: gcloud logging read '${filter}' --project ${GCP} > ${file}`
      );
    else if (existsSync(file)) out[k] = JSON.parse(readFileSync(file, 'utf8'));
    else {
      const args = ['logging', 'read', filter, '--project', GCP, '--format', 'json'];
      writeFileSync(file, execFileSync('gcloud', args, { encoding: 'utf8', maxBuffer: 1 << 30 }));
      out[k] = JSON.parse(readFileSync(file, 'utf8'));
    }
  }
  return dry ? null : out;
}

function main(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++)
    if (['--offline', '--dry-run'].includes(argv[i])) flags[argv[i]] = true;
    else if (argv[i].startsWith('--')) flags[argv[i]] = argv[++i];
    else pos.push(argv[i]);
  const [env, candidate, baseline] = pos;
  const agent = AGENTS[env];
  if (!agent || !candidate || !baseline || !flags['--candidate'] || !flags['--baseline'])
    throw new Error(
      'usage: release-check.mjs <dev|prod> <candidate-sha> <baseline-sha> --candidate DIR[,DIR] --baseline DIR[,DIR] [--logs DIR] [--offline] [--dry-run] [--seed S]'
    );
  const dirs = (k) => flags[k].split(',');
  const callsOf = (k) => dirs(k).flatMap((d) => loadSweep(d));
  const [cCalls, bCalls] = [callsOf('--candidate'), callsOf('--baseline')];
  if (!cCalls.length || !bCalls.length)
    throw new Error('no run files in the candidate or baseline dirs');
  const dead = deadGates();
  if (dead.length)
    throw new Error(`self-test: a gate can't go red, so it proves nothing: ${dead.join('; ')}`);
  console.log(
    `# release-check ${env}: candidate ${candidate} vs baseline ${baseline} (deploys nothing)`
  );
  console.log(`self-test: every gating predicate fails its canary\n`);

  const dry = flags['--dry-run'];
  let prov = [null, null];
  if (!flags['--offline']) {
    const logs = flags['--logs'] ?? mkdtempSync(join(tmpdir(), 'release-check-'));
    mkdirSync(logs, { recursive: true });
    const read = (side, calls, sha) => {
      const l = readLogs(logs, side, agent, calls, dry);
      return l && provenance(calls, l.boot, l.rooms, sha);
    };
    prov = [read('candidate', cCalls, candidate), read('baseline', bCalls, baseline)];
    if (dry) return 0;
    console.log(
      `## Provenance: Cloud Logging cloud-agents, agent ${agent}, project ${GCP} (logs in ${logs})`
    );
    for (const p of prov
      .flat()
      .filter((x) => x && x.status !== 'ok')
      .slice(0, 12))
      console.log(`${p.status.padEnd(8)} ${p.call}: ${p.commits.join(', ')}`);
  }

  console.log('\n## Candidate gate');
  const gates = dirs('--candidate').map((d) => [d, gateSweep(loadSweep(d))]);
  console.log(gates.map(([d, g]) => formatGate(g, d)).join('\n\n'));

  const values = (k) => dirs(k).flatMap((d) => sweepValues(d));
  const seed = flags['--seed'] === undefined ? undefined : Number(flags['--seed']);
  const isPrimary = (m) => PRIMARY.some((p) => p.metric === m);
  const rows = pairedCompare(values('--baseline'), values('--candidate'), { seed });
  const shown = [
    ...rows.filter((r) => isPrimary(r.metric)),
    ...rows.filter((r) => !isPrimary(r.metric)),
  ];
  console.log(
    '\n## Paired: candidate - baseline over shared scenarios (* primary, the rest reported only)'
  );
  console.log(
    formatPaired(
      shown.map((r) => ({ ...r, metric: `${isPrimary(r.metric) ? '*' : ' '}${r.metric}` }))
    )
  );

  const gateRows = gates.flatMap(([, g]) => g.rows);
  const res = checkRelease({
    gateRows,
    rows,
    provCandidate: prov[0],
    provBaseline: prov[1],
    candidate,
    baseline,
  });
  console.log('\n## Verdict');
  for (const i of res.items) console.log(`${i.verdict.padEnd(12)} ${i.name}: ${i.why}`);
  console.log(`RESULT_release_check=${res.verdict}`);
  return { PASS: 0, FAIL: 1, INCONCLUSIVE: 3 }[res.verdict];
}

// Real paths: a symlinked argv[1] would skip main() and exit 0, a silent PASS (as scorecard.mjs).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`release-check: ${e.message}`);
    process.exit(2);
  }
}
