#!/usr/bin/env node
// Nightly capability scorecard: one mechanical verdict (PASS / WARN / FAIL) per
// capability in capabilities.json, from a night's run files, and a diff against
// the newest earlier night.
//
// usage: scorecard.mjs <OUT> [--capabilities FILE] [--prev FILE|none] [--bar superhuman [--write DIR]]
//   OUT holds runs/ (<scenario>-<label>.json with .score.json and .judge.json
//   beside it), summary.json (analyze.py) and, when tool choice ran, tool-choice.json
//   (scripts/tool-retrieval/choice-score.mjs --out). The previous night is the newest
//   sibling <YYYY-MM-DD>/scorecard.json before OUT whose status is "ok".
// Writes OUT/scorecard.json, OUT/REPORT.md and OUT/COMMENT.md (verdicts and
// numbers only: COMMENT.md is posted to a public issue), each with the better-than-human
// bar (superhuman-bar.json, superhuman.mjs). --bar superhuman scores only that bar and the trust
// gates for any sweep dir and writes DIR/SUPERHUMAN.md and DIR/superhuman.json (DIR defaults to
// OUT), leaving OUT's REPORT.md alone; it exits 0 (2 on a harness error).
// Exit: 0 nothing newly FAIL and no regression; 1 a new FAIL, a regression, or a safety or
// trust gate (capabilities with gate: true) that FAILs, every night it lasts (only then does
// someone investigate); 2 harness error (no scored runs, bad input). The bar never changes it.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkRun, parseChecks } from '../recall-facts.mjs';
import { loadBar, prevBar, renderBar, scoreBar } from './superhuman.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = join(HERE, '..', 'scenarios');
export const RANK = { PASS: 0, WARN: 1, FAIL: 2 };
// Safety beats everything: these exit 1 for as long as they FAIL, and always list first.
export const SAFETY = ['crisis-real', 'crisis-false-alarm'];
const worst = (vs) => vs.reduce((a, v) => (RANK[v] > RANK[a] ? v : a), 'PASS');
const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const round = (x) => (x === null ? null : Math.round(x * 1000) / 1000);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);

/** Every scored run in OUT/runs: { base, scenario, run, score, judge, summary }. */
export function loadNight(out) {
  const dir = join(out, 'runs');
  if (!existsSync(dir)) return [];
  const summary = new Map((readJson(join(out, 'summary.json')) ?? []).map((r) => [r.file, r]));
  return readdirSync(dir)
    .filter((f) => f.endsWith('.score.json'))
    .sort()
    .map((f) => {
      const base = f.slice(0, -'.score.json'.length);
      const run = readJson(join(dir, `${base}.json`));
      return {
        base,
        scenario: run?.meta?.scenario ?? base.replace(/-[^-]+$/, ''),
        run,
        score: readJson(join(dir, f)),
        judge: readJson(join(dir, `${base}.judge.json`)),
        summary: summary.get(`${base}.json`) ?? null,
      };
    });
}

const replyHit = (r, re) => r.score.replyTexts.some((t) => re.test(t));
// A run without replyTexts, or an analyze row with only `error` (no job matched), measured
// nothing: it is left out, so a night of them reads as no data, never as 0.
const texted = (rs) => rs.filter((r) => Array.isArray(r.score?.replyTexts));
const rows = (rs) => rs.map((r) => r.summary).filter((s) => s && !s.error);
/** The pct-th percentile of the analyze rows' field (rows without it measured nothing). */
const pctOf = (rs, field, pct) => {
  const g = rows(rs)
    .flatMap((s) => (Array.isArray(s[field]) ? s[field] : []))
    .sort((a, b) => a - b);
  const at = Math.min(g.length - 1, Math.floor((g.length * pct) / 100));
  return { value: g.length ? g[at] : null, n: g.length };
};

/** A metric over a set of runs: { value, n } (value null = nothing measured it). extra holds
 *  measurements that aren't calls: toolChoice (choice-score.mjs output). */
export function metric(check, runs, caps, extra = {}) {
  const re =
    check.pattern &&
    new RegExp(check.pattern === 'crisis' ? caps.crisisPattern : check.pattern, 'i');
  const benign = (caps.benignL50 ?? []).map((p) => new RegExp(p));
  const t = texted(runs);
  const n = t.length;
  switch (check.metric) {
    case 'callsMatching':
      return { value: n ? t.filter((r) => replyHit(r, re)).length : null, n };
    case 'callsNotMatching':
      return { value: n ? t.filter((r) => !replyHit(r, re)).length : null, n };
    case 'ownOpener': {
      const o = runs.map((r) => r.score?.ownOpener).filter(Boolean);
      const value = o.length ? sum(o.map((x) => x.answeredByFerni)) : null;
      return { value, n: sum(o.map((x) => x.asked)) };
    }
    case 'recallRate': {
      const rates = runs.flatMap((r) => {
        const file = join(SCENARIOS, `${r.scenario}.txt`);
        const checks = r.run && existsSync(file) ? parseChecks(readFileSync(file, 'utf8')) : [];
        const rate = checks.some((c) => c.kind === 'fact') ? checkRun(r.run, checks).rate : null;
        return rate === null ? [] : [rate];
      });
      return { value: round(mean(rates)), n: rates.length };
    }
    case 'inventedShare': {
      const j = runs.filter((r) => r.judge);
      const bad = j.filter((r) => (r.judge.inventedHistory ?? []).length > 0).length;
      return { value: j.length ? round(bad / j.length) : null, n: j.length };
    }
    case 'judgeMean': {
      const v = runs
        .map((r) =>
          check.dim === 'humanLikelihood' ? r.judge?.humanLikelihood : r.judge?.scores?.[check.dim]
        )
        .filter((x) => typeof x === 'number');
      return { value: round(mean(v)), n: v.length };
    }
    case 'replyGapP50Ms':
      return pctOf(runs, 'reply_gaps', 50);
    case 'replyGapPctMs':
      return pctOf(runs, 'reply_gaps', check.pct);
    case 'toolReplyGapPctMs':
      return pctOf(runs, 'tool_reply_gaps', check.pct);
    case 'judgedWith': {
      // Calls whose judge verdict lists anything under field (inventedHistory, reAsked). A verdict
      // without the field (an older judge) measured nothing.
      const j = runs.filter((r) => Array.isArray(r.judge?.[check.field]));
      return {
        value: j.length ? j.filter((r) => r.judge[check.field].length).length : null,
        n: j.length,
      };
    }
    case 'capabilityCheck': {
      // Another capability's check value, scored first (scoreNight); none is no data.
      const k = extra.scored?.[check.capability]?.checks?.find((c) => c.id === check.check);
      return { value: k?.value ?? null, n: k?.n ?? 0 };
    }
    case 'interruptYield':
    case 'backchannelStop': {
      const [hit, of] =
        check.metric === 'interruptYield'
          ? ['interruptYielded', 'interrupts']
          : ['backchannelStoppedAgent', 'backchannels'];
      const t = runs.map((r) => r.score?.talkOver ?? {});
      const den = sum(t.map((x) => x[of] ?? 0));
      return { value: den ? round(sum(t.map((x) => x[hit] ?? 0)) / den) : null, n: den };
    }
    case 'sounds': {
      // A count from score.mjs `sounds` (sounds.mjs), summed over the runs that measured it.
      const xs = runs
        .map((r) => r.score?.sounds?.[check.field])
        .filter((x) => typeof x === 'number');
      return { value: xs.length ? sum(xs) : null, n: xs.length };
    }
    case 'toolErrors': {
      const s = rows(runs);
      return { value: s.length ? sum(s.map((x) => x.tool_errors ?? 0)) : null, n: s.length };
    }
    case 'unknownL50': {
      const s = rows(runs);
      const lines = s.flatMap((x) => x.l50 ?? []).filter((l) => !benign.some((b) => b.test(l)));
      return { value: s.length ? lines.length : null, n: s.length };
    }
    case 'handoffFailed':
    case 'callsWithoutHandoff': {
      const s = rows(runs);
      const lines = (x) => x.handoff_lines ?? [];
      const value =
        check.metric === 'handoffFailed'
          ? sum(s.map((x) => lines(x).filter((l) => /FAILED|handoff_failed/i.test(l)).length))
          : s.filter((x) => !lines(x).some((l) => /HANDOFF COMPLETE/.test(l))).length;
      return { value: s.length ? value : null, n: s.length };
    }
    case 'toolChoiceRate': {
      // Only a choice-score.mjs summary with a finite rate and a PASS/FAIL verdict measured
      // anything; INVALID, a raw row array or a malformed file is no data (WARN), never a PASS.
      // The value is the worse of the scored-rows rate and the errors-counted-wrong worst case.
      const t = extra.toolChoice;
      const share = (x) => Number.isFinite(x) && x >= 0 && x <= 1;
      const ok = t && !Array.isArray(t) && share(t.rate) && ['PASS', 'FAIL'].includes(t.verdict);
      const value = ok ? Math.min(t.rate, share(t.worst) ? t.worst : t.rate) : null;
      return { value: round(value), n: ok && Number.isFinite(t.n) ? t.n : 0 };
    }
    default:
      throw new Error(`unknown metric ${check.metric}`);
  }
}

/** PASS / WARN / FAIL for one value; maxDrop compares it with last night's. */
export function judgeCheck(check, value, prevValue) {
  if (value === null || value === undefined) return { verdict: 'WARN', reason: 'no data' };
  const lower = check.better === 'lower';
  const over = (t) => t !== null && t !== undefined && (lower ? value > t : value < t);
  let verdict = over(check.fail) ? 'FAIL' : over(check.warn) ? 'WARN' : 'PASS';
  let reason =
    verdict === 'PASS'
      ? ''
      : `${lower ? '>' : '<'} ${verdict === 'FAIL' ? check.fail : check.warn}`;
  let regressed = false;
  if (check.maxDrop !== undefined && typeof prevValue === 'number') {
    const drop = lower ? value - prevValue : prevValue - value;
    if (drop > check.maxDrop) {
      regressed = true;
      verdict = worst([verdict, 'WARN']);
      reason = `${reason ? `${reason}; ` : ''}worse by ${round(drop)} (max ${check.maxDrop})`;
    }
  }
  return { verdict, reason, regressed };
}

/** The night's scorecard; prev is the previous night's scorecard.json or null. */
export function scoreNight(runs, caps, prev = null, extra = {}) {
  const scored = {};
  const gate = (id) => Boolean(caps.capabilities[id].gate);
  // Gates read other capabilities' checks (capabilityCheck), so they are scored last.
  for (const id of Object.keys(caps.capabilities).sort((a, b) => gate(a) - gate(b))) {
    const cap = caps.capabilities[id];
    const mine = runs.filter((r) => cap.scenarios.includes(r.scenario));
    const missing = cap.scenarios.filter((s) => !mine.some((r) => r.scenario === s));
    const checks = [];
    if (cap.scenarios.length) {
      const v = missing.length;
      checks.push({
        id: 'missing',
        metric: 'missingScenarios',
        value: v,
        n: cap.scenarios.length,
        verdict: v ? 'WARN' : 'PASS',
        reason: v ? `no run: ${missing.join(', ')}` : '',
      });
    }
    for (const c of cap.checks) {
      // A check on a capability that isn't configured yet (another branch adds it) is skipped.
      if (c.metric === 'capabilityCheck' && !caps.capabilities[c.capability]) continue;
      const scope =
        c.scope === 'all'
          ? runs.filter((r) => !(c.exceptScenarios ?? []).includes(r.scenario))
          : mine;
      const { value, n } = metric(c, scope, caps, { ...extra, scored });
      const was = prev?.capabilities?.[id]?.checks?.find((p) => p.id === c.id);
      const k = { id: c.id, metric: c.metric, value, n, ...judgeCheck(c, value, was?.value) };
      // A check that FAILed last night and measures nothing now hasn't been fixed.
      checks.push(
        was?.verdict === 'FAIL' && k.reason === 'no data' ? { ...k, failToNoData: true } : k
      );
    }
    scored[id] = {
      label: cap.label,
      ...(cap.gate ? { gate: true } : {}),
      verdict: worst(checks.map((c) => c.verdict)),
      prev: prev?.capabilities?.[id]?.verdict ?? null,
      checks,
      runs: mine.map((r) => r.base),
    };
  }
  // Safety first, then the trust gates, then the rest in capabilities.json order.
  const rank = (id) =>
    SAFETY.includes(id) ? SAFETY.indexOf(id) : SAFETY.length + (scored[id].gate ? 0 : 1);
  const ids = Object.keys(caps.capabilities).filter((id) => scored[id]);
  const capabilities = Object.fromEntries(
    ids.sort((a, b) => rank(a) - rank(b)).map((id) => [id, scored[id]])
  );
  return { capabilities, diff: diffNights(capabilities) };
}

const unmeasured = (c) =>
  c.checks.filter((k) => k.reason === 'no data' || (k.id === 'missing' && k.value));

/** New FAILs (FAIL now, not FAIL last night) and regressions (verdict or metric got worse). */
export function diffNights(capabilities) {
  const newFail = [];
  const regressions = [];
  const safetyFail = SAFETY.filter((id) => capabilities[id]?.verdict === 'FAIL');
  // Unproven safety is not a pass: a safety capability with a check that measured nothing.
  const safetyNoData = SAFETY.filter(
    (id) => capabilities[id] && !safetyFail.includes(id) && unmeasured(capabilities[id]).length
  );
  // A trust gate (invented memory, re-asking, a false "done") exits 1 every night it FAILs; with no
  // data it is WARN and named on the top line, but does not exit (false-done has no lane yet).
  const gateFail = Object.keys(capabilities).filter(
    (id) => capabilities[id].gate && capabilities[id].verdict === 'FAIL'
  );
  const gateNoData = Object.keys(capabilities).filter(
    (id) => capabilities[id].gate && !gateFail.includes(id) && unmeasured(capabilities[id]).length
  );
  for (const [id, c] of Object.entries(capabilities)) {
    if (c.verdict === 'FAIL' && c.prev !== 'FAIL') newFail.push(id);
    else if (c.prev && RANK[c.verdict] > RANK[c.prev])
      regressions.push(`${id}: ${c.prev} -> ${c.verdict}`);
    // A FAIL that now measures nothing hasn't been fixed: a broken harness must not read as better.
    // Only when a check that FAILed last night is the one with no data, and the capability left FAIL.
    else if (c.verdict !== 'FAIL' && c.checks.some((k) => k.failToNoData))
      regressions.push(`${id}: FAIL -> no data`);
    for (const k of c.checks.filter((k) => k.regressed))
      regressions.push(`${id}.${k.id}: ${k.reason}`);
  }
  const exit =
    newFail.length ||
    regressions.length ||
    safetyFail.length ||
    safetyNoData.length ||
    gateFail.length
      ? 1
      : 0;
  return { newFail, regressions, safetyFail, safetyNoData, gateFail, gateNoData, exit };
}

/** The newest earlier night's scorecard.json with status "ok", or null. */
export function findPrev(out) {
  const root = dirname(out);
  const me = basename(out);
  const nights = existsSync(root)
    ? readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < me)
    : [];
  for (const d of nights.sort().reverse()) {
    const s = readJson(join(root, d, 'scorecard.json'));
    if (s?.status === 'ok') return { ...s, file: join(root, d, 'scorecard.json') };
  }
  return null;
}

const fmt = (v) => (v === null || v === undefined ? '-' : String(v));
const checkText = (k) => `${k.id}=${fmt(k.value)}${k.verdict === 'PASS' ? '' : ` (${k.reason})`}`;
/** One bold top line naming each capability in ids with its checks that pick keeps. */
const topLine = (card, title, ids = [], pick, text) =>
  ids.length
    ? `**${title}${ids
        .map((id) => `${id} (${pick(card.capabilities[id]).map(text).join('; ')})`)
        .join(', ')}**\n\n`
    : '';
const failed = (c) => c.checks.filter((k) => k.verdict === 'FAIL');
const noData = (k) => `${k.id}: ${k.reason}`;
/** The first lines of every report while a safety capability or a trust gate FAILs or measured
 *  nothing. */
export const safetyLine = (card) =>
  topLine(card, 'SAFETY FAIL: ', card.diff.safetyFail, failed, checkText) +
  topLine(card, 'SAFETY: no data — ', card.diff.safetyNoData, unmeasured, noData) +
  topLine(card, 'TRUST GATE FAIL: ', card.diff.gateFail, failed, checkText) +
  topLine(card, 'TRUST GATE: no data — ', card.diff.gateNoData, unmeasured, noData);

export function renderReport(card) {
  const head = `# Nightly capability sweep ${card.date}\n\nBuild ${card.build ?? '?'}, ${card.runs} scored runs. Exit ${card.exit}.`;
  const diff =
    card.diff.newFail.length || card.diff.regressions.length
      ? `\n\n**New FAIL:** ${card.diff.newFail.join(', ') || 'none'}. **Regressions:** ${card.diff.regressions.join('; ') || 'none'}.`
      : `\n\nNothing newly FAIL, no regression${card.prevFile ? '' : ' (no earlier night to compare)'}.`;
  const table = Object.entries(card.capabilities).map(
    ([id, c]) =>
      `| ${id} | ${c.verdict} | ${fmt(c.prev)} | ${c.checks.map(checkText).join('; ')} | ${c.runs.map((b) => `[${b}](runs/${b}.score.json)`).join(' ')} |`
  );
  return `${safetyLine(card)}${head}${diff}\n\n| Capability | Verdict | Last night | Checks | Runs |\n|---|---|---|---|---|\n${table.join('\n')}\n${renderBar(card.superhuman)}`;
}

/** For the public tracking issue: verdicts and numbers only, no run names. */
export function renderComment(card) {
  const lines = Object.entries(card.capabilities).map(
    ([id, c]) =>
      `| ${id} | ${c.verdict}${c.prev && c.prev !== c.verdict ? ` (was ${c.prev})` : ''} | ${c.checks.map(checkText).join('; ')} |`
  );
  return `${safetyLine(card)}**${card.date}** build \`${card.build ?? '?'}\`: ${card.runs} runs, exit ${card.exit}\n\n| Capability | Verdict | Numbers |\n|---|---|---|\n${lines.join('\n')}\n${renderBar(card.superhuman)}`;
}

const USAGE =
  'usage: scorecard.mjs <OUT> [--capabilities FILE] [--prev FILE|none] [--bar superhuman [--write DIR]]';

/** --bar superhuman: the trust gates and the better-than-human bar for any sweep dir. */
export function renderBarReport(card) {
  const gates = Object.entries(card.capabilities)
    .filter(([, c]) => c.gate)
    .map(([id, c]) => `| ${id} | ${c.verdict} | ${c.checks.map(checkText).join('; ')} |`);
  return `# Better-than-human bar: ${card.date}\n\nBuild ${card.build ?? '?'}, ${card.runs} scored runs.\n\n## Trust gates (exit 1 in the nightly)\n\n| Gate | Verdict | Numbers |\n|---|---|---|\n${gates.join('\n')}\n${renderBar(card.superhuman)}`;
}

function main(argv) {
  const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const out = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  if (!out) throw new Error(USAGE);
  const mode = opt('--bar');
  if (argv.includes('--bar') && mode !== 'superhuman') throw new Error(USAGE);
  const caps = JSON.parse(
    readFileSync(opt('--capabilities') ?? join(HERE, 'capabilities.json'), 'utf8')
  );
  const bar = loadBar(join(HERE, 'superhuman-bar.json'));
  const runs = loadNight(out);
  if (!runs.length) throw new Error(`no scored runs in ${join(out, 'runs')}`);
  const p = opt('--prev');
  const prev =
    p === 'none' ? null : p ? { ...JSON.parse(readFileSync(p, 'utf8')), file: p } : findPrev(out);
  const toolChoice = readJson(join(out, 'tool-choice.json'));
  const { capabilities, diff } = scoreNight(runs, caps, prev, { toolChoice });
  const barOf = (dir) =>
    scoreBar(loadNight(dir), bar, caps, metric, {
      toolChoice: readJson(join(dir, 'tool-choice.json')),
    });
  const superhuman = scoreBar(runs, bar, caps, metric, { toolChoice }, prevBar(prev, barOf));
  const build = existsSync(join(out, 'build.txt'))
    ? readFileSync(join(out, 'build.txt'), 'utf8').trim()
    : null;
  const card = {
    status: 'ok',
    date: basename(out),
    generatedAt: new Date().toISOString(),
    build,
    runs: runs.length,
    prevFile: prev?.file ?? null,
    exit: diff.exit,
    diff,
    capabilities,
    superhuman,
  };
  if (mode) {
    // Report only, and never OUT's REPORT.md: the nightly's exit code stays the nightly's.
    const dir = opt('--write') ?? out;
    mkdirSync(dir, { recursive: true });
    const { date, build: b, runs: n, prevFile } = card;
    const gates = Object.fromEntries(Object.entries(capabilities).filter(([, c]) => c.gate));
    const json = { date, build: b, runs: n, prevFile, gates, superhuman };
    writeFileSync(join(dir, 'superhuman.json'), `${JSON.stringify(json, null, 2)}\n`);
    writeFileSync(join(dir, 'SUPERHUMAN.md'), renderBarReport(card));
    console.log(renderBarReport(card));
    return 0;
  }
  writeFileSync(join(out, 'scorecard.json'), `${JSON.stringify(card, null, 2)}\n`);
  writeFileSync(join(out, 'REPORT.md'), renderReport(card));
  writeFileSync(join(out, 'COMMENT.md'), renderComment(card));
  for (const [id, c] of Object.entries(capabilities)) console.log(c.verdict.padEnd(4), id);
  console.log(`bar  ${superhuman.met}/${superhuman.of} better-than-human targets met`);
  return diff.exit;
}

// Compare real paths: node resolves symlinks (/var -> /private/var) in import.meta.url, and a
// mismatch here would skip main() and exit 0, a silent PASS.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`scorecard: ${e.message}`);
    process.exit(2);
  }
}
