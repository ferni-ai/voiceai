#!/usr/bin/env node
// Echo eval report: what the agent's barge-in logic did on one scripted call
// (run.sh, with or without --echo), from the agent's own log lines.
//
// usage: echo-report.mjs <run.json> --logs FILE... [--room NAME] [--job ID...] [--out FILE]
//        echo-report.mjs --compare <a.echo.json> <b.echo.json>
// --logs: a capture-logs.sh (`lk agent logs`) file, or saved
//   `gcloud logging read --format=json` output covering the call.
// The call is found by its room (run.json meta.room, or --room): the job ids on
// lines naming it, then every line of those jobs (sessionId is
// session-<jobId>-<ms>; LOOP_STALL carries jobId). --job adds ids by hand.
// Writes <run>.echo.json (or --out) and prints a one-screen summary.
// Counts, timings and ids only: no transcript, no caller or agent words.
import { readFileSync, writeFileSync } from 'node:fs';

/** Every JSON object in a log dump, each distinct line once (a reconnecting capture repeats lines). */
export function payloadsOf(text) {
  const head = text.trimStart();
  const raws = head.startsWith('[')
    ? JSON.parse(head).map(
        (e) => e.textPayload ?? (e.jsonPayload ? JSON.stringify(e.jsonPayload) : '')
      )
    : text.split('\n');
  const seen = new Set();
  const out = [];
  for (const raw of raws) {
    const i = raw.indexOf('{');
    if (i < 0) continue;
    const s = raw.slice(i).trim();
    if (seen.has(s)) continue;
    try {
      const j = JSON.parse(s);
      if (j && typeof j === 'object') out.push(j);
      seen.add(s);
    } catch {
      // a cut or non-JSON line: nothing to count
    }
  }
  return out;
}

const jobOfSession = (s) =>
  typeof s === 'string' && s.startsWith('session-') ? s.slice(8).replace(/-\d+$/, '') : null;

/** The lines of the call held in `room`, with the job and session ids that tie them to it. */
export function callLines(payloads, room, extraJobs = []) {
  const jobs = new Set(extraJobs);
  for (const p of payloads) {
    if (!room || (p.roomName !== room && p.room !== room)) continue;
    if (typeof p.jobId === 'string') jobs.add(p.jobId);
    // e2e "Connected to room" logs the job id as sessionId
    if (typeof p.sessionId === 'string') jobs.add(jobOfSession(p.sessionId) ?? p.sessionId);
  }
  const lines = payloads.filter(
    (p) => jobs.has(p.jobId) || jobs.has(p.sessionId) || jobs.has(jobOfSession(p.sessionId))
  );
  const sessions = [...new Set(lines.map((l) => l.sessionId).filter((s) => jobOfSession(s)))];
  return { jobs: [...jobs].sort(), sessions: sessions.sort(), lines };
}

/** A SESSION_INTERRUPT stack frame without its directory or column: "fn (file.js:92)". */
export function callerFrame(frame) {
  if (typeof frame !== 'string' || !frame.trim()) return 'unknown';
  return frame
    .trim()
    .replace(/^at\s+/, '')
    .replace(/(?<=^|[(\s])(?:file:\/\/)?\/(?:[^/\s()]+\/)+/g, '')
    .replace(/:(\d+):\d+(\)?)$/, ':$1$2');
}

const tally = (xs, key) => {
  const o = {};
  for (const x of xs) {
    const k = String(key(x) ?? 'unknown');
    o[k] = (o[k] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
};
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Barge-in, stall and reply counts from one call's lines. */
export function echoMetrics(lines) {
  const by = (m) => lines.filter((l) => l.msg === m);
  const interrupts = by('SESSION_INTERRUPT');
  const fast = by('BARGE_IN_FASTPATH');
  const fi = by('BARGE_IN_FALSE_INTERRUPTION');
  const soft = by('BARGE_IN_SOFT_PAUSE');
  const stalls = by('LOOP_STALL');
  const stallMs = stalls.map((s) => s.ms).filter(isNum);
  const summary = by('LOOP_SUMMARY').at(-1);
  // TURN_RECEIPT: a reply started when Ferni's audio began, completed when it
  // ran to the end (endedBy listening) without being cut.
  const receipts = lines.filter((l) => l.msg === 'TURN_RECEIPT' || l.event === 'TURN_RECEIPT');
  const started = receipts.filter(
    (r) => isNum(r.timing?.commitToAudioMs) || isNum(r.timing?.firstAudioMs)
  );
  const completed = started.filter((r) => r.endedBy === 'listening' && !r.reply?.interrupted);
  return {
    sessionInterrupts: {
      n: interrupts.length,
      byCaller: tally(interrupts, (l) => callerFrame(l.caller)),
      byAgentState: tally(interrupts, (l) => l.agentState),
    },
    bargeInFastPath: { n: fast.length, byReason: tally(fast, (l) => l.reason) },
    falseInterruptions: { n: fi.length, unresumed: fi.filter((l) => l.resumed === false).length },
    softPause: { n: soft.length, byOutcome: tally(soft, (l) => l.outcome) },
    loopStalls: {
      n: stalls.length,
      maxMs: stallMs.length ? Math.max(...stallMs) : null,
      totalMs: stallMs.reduce((a, b) => a + b, 0),
      whileSpeaking: stalls.filter((s) => s.agentState === 'speaking' || isNum(s.speakingMs))
        .length,
      // LOOP_STALL is capped at 100 lines a call; the summary has the true count.
      summary: summary
        ? { stalls: summary.stalls, maxMs: summary.maxMs, speakingStalls: summary.speakingStalls }
        : null,
    },
    replies: {
      turns: receipts.length,
      started: started.length,
      completed: completed.length,
      cut: started.filter((r) => r.reply?.interrupted).length,
    },
  };
}

/** The report for one converse.mjs run. */
export function reportOf(run, payloads, { room = run.meta?.room ?? null, jobs = [] } = {}) {
  const call = callLines(payloads, room, jobs);
  const { env = null, scenario = null, label = null } = run.meta ?? {};
  return {
    v: 1,
    run: { env, scenario, label, wallT0: run.wallT0 ?? null },
    room,
    jobs: call.jobs,
    sessions: call.sessions,
    echo: run.echo
      ? { gainDb: run.echo.gainDb, delayMs: run.echo.delayMs, noiseDb: run.echo.noiseDb }
      : null,
    logLines: call.lines.length,
    metrics: echoMetrics(call.lines),
  };
}

const top = (o, n = 4) =>
  Object.entries(o)
    .slice(0, n)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ') || '-';

/** One screen of text. */
export function summaryOf(r) {
  const x = r.metrics;
  const echo = r.echo
    ? `echo ${r.echo.gainDb} dB, ${r.echo.delayMs} ms, noise ${r.echo.noiseDb ?? 'off'}`
    : 'no echo';
  const out = [
    `${r.run.scenario ?? '?'} ${r.run.label ?? ''}  room ${r.room ?? '?'}  ${echo}  (${r.logLines} log lines, jobs ${r.jobs.join(' ') || 'none'})`,
    `session interrupts   ${x.sessionInterrupts.n}  by state: ${top(x.sessionInterrupts.byAgentState)}`,
    ...Object.entries(x.sessionInterrupts.byCaller)
      .slice(0, 5)
      .map(([k, v]) => `    ${String(v).padStart(3)}  ${k}`),
    `barge-in fast path   ${x.bargeInFastPath.n}  ${top(x.bargeInFastPath.byReason)}`,
    `false interruptions  ${x.falseInterruptions.n}  unresumed ${x.falseInterruptions.unresumed}`,
    `soft pause           ${x.softPause.n}  ${top(x.softPause.byOutcome)}`,
    `loop stalls          ${x.loopStalls.n}  max ${x.loopStalls.maxMs ?? '-'} ms, ${x.loopStalls.whileSpeaking} while speaking`,
    `replies              started ${x.replies.started}, completed ${x.replies.completed}, cut ${x.replies.cut} (${x.replies.turns} turns)`,
  ];
  if (!r.logLines) out.push('NO LOG LINES for this call: check --logs covers it, or pass --job');
  return out.join('\n');
}

/** Numeric leaves of a report's metrics, as dotted keys. */
function flat(o, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(o ?? {})) {
    if (isNum(v)) out[prefix + k] = v;
    else if (v && typeof v === 'object') flat(v, `${prefix}${k}.`, out);
  }
  return out;
}

/** Every metric in either report: [key, a, b, b - a]; a missing count is 0. */
export function compareReports(a, b) {
  const fa = flat(a.metrics);
  const fb = flat(b.metrics);
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort();
  return keys.map((k) => [k, fa[k] ?? 0, fb[k] ?? 0, (fb[k] ?? 0) - (fa[k] ?? 0)]);
}

function main(argv) {
  const list = (k) => {
    const i = argv.indexOf(k);
    if (i < 0) return [];
    const rest = argv.slice(i + 1);
    const end = rest.findIndex((a) => a.startsWith('--'));
    return end < 0 ? rest : rest.slice(0, end);
  };
  if (argv[0] === '--compare') {
    const [a, b] = argv.slice(1, 3).map((f) => JSON.parse(readFileSync(f, 'utf8')));
    const echo = (r) => (r.echo ? `echo ${r.echo.gainDb} dB ${r.echo.delayMs} ms` : 'no echo');
    const row = (k, ...v) =>
      console.log(k.padEnd(56) + v.map((x) => String(x).padStart(7)).join(''));
    console.log(
      `a: ${a.run.label} ${a.room} (${echo(a)})\nb: ${b.run.label} ${b.room} (${echo(b)})`
    );
    row('metric', 'a', 'b', 'delta');
    for (const [k, va, vb, d] of compareReports(a, b)) row(k, va, vb, d > 0 ? `+${d}` : d);
    return;
  }
  const [runFile] = argv;
  const logs = list('--logs');
  if (!runFile || runFile.startsWith('--') || !logs.length) {
    console.error('usage: see the top of echo-report.mjs');
    process.exit(2);
  }
  const run = JSON.parse(readFileSync(runFile, 'utf8'));
  const payloads = logs.flatMap((f) => payloadsOf(readFileSync(f, 'utf8')));
  const report = reportOf(run, payloads, {
    room: list('--room')[0] ?? run.meta?.room ?? null,
    jobs: list('--job'),
  });
  const out = list('--out')[0] ?? runFile.replace(/\.json$/, '.echo.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(summaryOf(report));
  console.log(`\n${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
