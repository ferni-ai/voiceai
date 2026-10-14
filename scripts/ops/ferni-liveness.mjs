#!/usr/bin/env node
// Is Ferni answering callers? A read-only liveness check over the voice
// agent's Cloud Logging lines (projects/<p>/logs/cloud-agents).
//
// On 2026-10-11 every agent built since #886 joined calls and never replied
// (ERR_MODULE_NOT_FOUND on a pruned runtime file); only a smoke call noticed.
// This counts, per agent and over the last N minutes: calls, caller turns,
// Ferni's replies, turns left unanswered, error and uncaught-exception lines,
// and the deployed version. It exits 1 when:
//   - a call had >= 2 caller turns and no reply,
//   - uncaught exceptions spiked (> --max-uncaught), or a runtime module failed to load,
//   - the reply rate fell under --min-reply-rate (with >= --min-turns caller turns),
// and 2 when the logs could not be read. It prints counts only: no words, no user ids.
//
// usage: ferni-liveness.mjs [--env prod|dev|both] [--minutes 60] [--json]
//          [--min-reply-rate 0.5] [--min-turns 5] [--max-uncaught 2]
//          [--file entries.json]   (a saved `gcloud logging read --format=json`)
//
// Signals (all lines carry sessionId unless noted):
//   caller turn   distinct turnNumber of '🧠 [MEMORY-AUDIT] recordTurn START'
//   reply         'REPLY_GAP' (one per caller turn that got audio, reply-gap.ts), or
//                 'TURN_METRICS' on builds before REPLY_GAP (2026-10-10), whichever is more
//   unanswered    TURN_RECEIPT with reply.messages 0 (builds with turn-receipt.ts),
//                 else caller turns minus replies, per call
//   call          a sessionId seen; jobs = '[ENTRY] Entry function called' (no sessionId)
//   uncaught      '[CRASH-ANALYTICS] UNCAUGHT_EXCEPTION'
//   version       the deployment's pod-template hash in the hostname (changes per deploy)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const AGENTS = { prod: 'CA_GeFvEpsNXLSF', dev: 'CA_siTDMHEba4Fg' };
const PROJECT = process.env.GCP_PROJECT ?? 'johnb-2025';

const MARKERS = [
  'recordTurn START',
  'REPLY_GAP',
  'TURN_METRICS',
  'TURN_RECEIPT',
  'Entry function called',
  'UNCAUGHT_EXCEPTION',
  'ERR_MODULE_NOT_FOUND',
  'Cannot find module',
  'Cannot find package',
  'NEVER_SILENT_FALLBACK',
  '"level":50',
  '"level":60',
];

/** The Cloud Logging filter for one agent's liveness lines since `sinceIso`. */
export function logFilter(agentId, sinceIso, project = PROJECT) {
  const any = MARKERS.map((m) => `textPayload:${JSON.stringify(m)}`).join(' OR ');
  return [
    `logName="projects/${project}/logs/cloud-agents"`,
    `labels.agent_id="${agentId}"`,
    `timestamp>="${sinceIso}"`,
    `(${any})`,
  ].join(' AND ');
}

/** A pino JSON line (maybe after a prefix) or null. */
function jsonOf(text) {
  const i = text.indexOf('{');
  if (i < 0) return null;
  try {
    return JSON.parse(text.slice(i));
  } catch {
    return null;
  }
}

/** deployment-p-<project>-<agent>-<template hash>-<pod> -> <template hash>. */
export function versionOf(hostname) {
  const parts = String(hostname ?? '').split('-');
  return parts.length >= 3 && parts[0] === 'deployment' ? parts[parts.length - 2] : null;
}

const RUNTIME_LOAD = /ERR_MODULE_NOT_FOUND|Cannot find (module|package)/;

/** Liveness counts for one agent from its log entries. */
export function summarize(entries) {
  const calls = new Map(); // sessionId -> { turns: Set, replies, unanswered: number|null }
  const call = (id) => {
    let c = calls.get(id);
    if (!c) {
      c = { id, turns: new Set(), gaps: 0, metrics: 0, receipts: 0, unanswered: 0 };
      calls.set(id, c);
    }
    return c;
  };
  const versions = new Map(); // hash -> { first, last }
  let jobs = 0;
  let errors = 0;
  let uncaught = 0;
  let moduleLoad = 0;
  let fallbacks = 0;
  for (const e of entries) {
    const text = e.textPayload ?? '';
    const at = e.timestamp ?? '';
    if (text.includes('Entry function called')) jobs += 1;
    if (RUNTIME_LOAD.test(text)) moduleLoad += 1;
    const j = jsonOf(text);
    if (!j) continue;
    const msg = String(j.msg ?? '');
    const version = versionOf(j.hostname);
    if (version) {
      const v = versions.get(version) ?? { first: at, last: at };
      if (at < v.first) v.first = at;
      if (at > v.last) v.last = at;
      versions.set(version, v);
    }
    if (typeof j.level === 'number' && j.level >= 50) errors += 1;
    if (msg.includes('UNCAUGHT_EXCEPTION')) uncaught += 1;
    if (msg === 'NEVER_SILENT_FALLBACK') fallbacks += 1;
    if (!j.sessionId) continue;
    if (msg.includes('recordTurn START')) call(j.sessionId).turns.add(j.turnNumber);
    else if (msg === 'REPLY_GAP') call(j.sessionId).gaps += 1;
    else if (msg === 'TURN_METRICS') call(j.sessionId).metrics += 1;
    else if (j.event === 'TURN_RECEIPT') {
      const c = call(j.sessionId);
      c.receipts += 1;
      if (!j.reply?.messages) c.unanswered += 1;
    }
  }
  const list = [...calls.values()].filter((c) => c.turns.size || c.gaps || c.metrics || c.receipts);
  for (const c of list) c.replies = Math.max(c.gaps, c.metrics);
  const silent = list.filter((c) => c.turns.size >= 2 && c.replies === 0);
  const turns = list.reduce((a, c) => a + c.turns.size, 0);
  const replies = list.reduce((a, c) => a + c.replies, 0);
  const unansweredOf = (c) => (c.receipts ? c.unanswered : Math.max(0, c.turns.size - c.replies));
  const latest = [...versions.entries()].sort((a, b) => (a[1].last < b[1].last ? 1 : -1))[0];
  return {
    calls: list.length,
    jobs,
    callerTurns: turns,
    replies,
    replyRate: turns ? Math.round((Math.min(replies, turns) / turns) * 1000) / 1000 : null,
    unansweredTurns: list.reduce((a, c) => a + unansweredOf(c), 0),
    silentCalls: silent.length,
    /** Up to 10 of them, for triage: session ids name a room, not a person. */
    silentSessions: silent.slice(0, 10).map((c) => c.id),
    errorLines: errors,
    uncaught,
    moduleLoadFailures: moduleLoad,
    neverSilentFallbacks: fallbacks,
    version: latest?.[0] ?? null,
    versions: Object.fromEntries(versions),
  };
}

/** Why this summary should page someone; empty when healthy. */
export function alarms(s, opts = {}) {
  const minRate = opts.minReplyRate ?? 0.5;
  const minTurns = opts.minTurns ?? 5;
  const maxUncaught = opts.maxUncaught ?? 2;
  const out = [];
  if (s.silentCalls > 0) out.push(`${s.silentCalls} call(s) with 2+ caller turns and no reply`);
  if (s.uncaught > maxUncaught) out.push(`${s.uncaught} uncaught exceptions (max ${maxUncaught})`);
  if (s.moduleLoadFailures > 0)
    out.push(`${s.moduleLoadFailures} runtime module load failure line(s)`);
  if (s.callerTurns >= minTurns && s.replyRate !== null && s.replyRate < minRate)
    out.push(`reply rate ${s.replyRate} under ${minRate} (${s.callerTurns} caller turns)`);
  return out;
}

function readLogs(agentId, minutes) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const out = execFileSync(
    'gcloud',
    [
      'logging',
      'read',
      logFilter(agentId, since),
      `--project=${PROJECT}`,
      '--format=json',
      '--limit=100000',
    ],
    { encoding: 'utf8', maxBuffer: 1 << 30 }
  );
  return JSON.parse(out || '[]');
}

function args(argv) {
  const get = (name, dflt) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : dflt;
  };
  return {
    env: get('env', 'both'),
    minutes: Number(get('minutes', '60')),
    file: get('file', null),
    json: argv.includes('--json'),
    minReplyRate: Number(get('min-reply-rate', '0.5')),
    minTurns: Number(get('min-turns', '5')),
    maxUncaught: Number(get('max-uncaught', '2')),
  };
}

function main() {
  const opts = args(process.argv.slice(2));
  const envs = opts.env === 'both' ? ['prod', 'dev'] : [opts.env];
  const report = { window: { minutes: opts.minutes, until: new Date().toISOString() }, agents: {} };
  let failed = false;
  for (const env of envs) {
    const agentId = AGENTS[env];
    if (!agentId) throw new Error(`unknown env: ${env}`);
    let entries;
    try {
      entries = opts.file
        ? JSON.parse(readFileSync(opts.file, 'utf8')).filter((e) => e.labels?.agent_id === agentId)
        : readLogs(agentId, opts.minutes);
    } catch (error) {
      console.error(`${env}: could not read logs: ${String(error).slice(0, 300)}`);
      process.exitCode = 2;
      return;
    }
    const summary = summarize(entries);
    const why = alarms(summary, opts);
    if (why.length) failed = true;
    report.agents[env] = { agentId, ...summary, ok: why.length === 0, alarms: why };
  }
  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else
    for (const [env, a] of Object.entries(report.agents)) {
      console.log(
        `${a.ok ? 'OK  ' : 'FAIL'} ${env} ${a.agentId} v=${a.version ?? '?'} calls=${a.calls} jobs=${a.jobs} ` +
          `callerTurns=${a.callerTurns} replies=${a.replies} replyRate=${a.replyRate ?? '-'} ` +
          `unanswered=${a.unansweredTurns} silentCalls=${a.silentCalls} errors=${a.errorLines} ` +
          `uncaught=${a.uncaught} moduleLoad=${a.moduleLoadFailures} fallbacks=${a.neverSilentFallbacks}`
      );
      for (const reason of a.alarms) console.log(`     - ${reason}`);
    }
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
