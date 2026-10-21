#!/usr/bin/env node
// Nightly review of real calls: rebuild each call from the agent's Cloud
// Logging lines and measure what a listener would notice.
//
// usage: review-calls.mjs [--env prod|dev|both] [--since ISO] [--until ISO] [--out DIR]
//                         [--database ID]
// Opt-in flags are read from each env's Firestore database (eval-database.mjs:
// prod '(default)', dev EVAL_DEV_DATABASE); --database forces one for every env.
//
// Only these callers are ever reviewed: Seth (REVIEW_OWNER_UID), eval accounts
// (uid starts with voice-eval-) and anyone whose bogle_users doc has
// callReviewOptIn: true (absent means false). Other users' sessions are
// dropped before anything is kept, and lines without a sessionId are kept only
// when no other session was live on the same pod at that moment.
//
// Output (local only, never in the repo; it holds what callers said):
//   <out>/<YYYY-MM-DD>/calls.json   one record per call (schema below)
//   <out>/<YYYY-MM-DD>/runs/<session>.json   the call in judge.mjs run format,
//     plus notes: [{ t, notes }] (director notes) and tools: [{ t, tool }]
// judge-calls.mjs then judges each run and writes review.md.
//
// calls.json: { date, window: {since, until}, generatedAt, skipped (sessions
//   of callers who did not consent), calls: [{ sessionId, env, userKind:
//   'owner'|'eval'|'opt-in', startedAt, endedAt, durationSec, interleaved,
//   metrics, runFile }] }; metrics are documented on callMetrics.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { documentsUrl, evalDatabase } from './eval-database.mjs';

export const SETH_UID = 'vdSfkCCXaiXpnVCvgKxHMYrNFr72';
export const WORKERS = { prod: 'ca-gefvepsnxlsf', dev: 'ca-sitdmheba4fg' };
const PROJECT = process.env.GCP_PROJECT ?? 'johnb-2025';
const LOG = `projects/${PROJECT}/logs/cloud-agents`;
// A session's summary lands a few seconds after it ends; keep a margin for it.
const TAIL_MS = 90_000;

/** gcloud logging entries -> parsed payloads [{ time, host, msg, ...fields }], time order. */
export function parseEntries(entries) {
  const out = [];
  for (const e of entries) {
    const tp = e.textPayload ?? '';
    const i = tp.indexOf('{');
    if (i < 0) continue;
    try {
      const j = JSON.parse(tp.slice(i));
      out.push({
        ...j,
        time: j.time ?? Date.parse(e.timestamp),
        host: j.hostname ?? '',
        msg: j.msg ?? '',
      });
    } catch {
      // a truncated or non-JSON line: nothing to read
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Sessions seen in the index lines: { id, userId, host, start, end }. */
export function indexSessions(lines) {
  const byId = new Map();
  for (const l of lines) {
    if (!l.sessionId?.startsWith('session-')) continue;
    const s = byId.get(l.sessionId) ?? {
      id: l.sessionId,
      userId: null,
      host: l.host,
      start: null,
      end: null,
    };
    // session-<room>-<epoch ms> carries its own start time
    const started = Number(l.sessionId.split('-').pop());
    s.start =
      Number.isFinite(started) && started > 1e12 ? started : Math.min(s.start ?? l.time, l.time);
    if (l.userId && !s.userId) s.userId = l.userId;
    if (l.module === 'FinOps' && l.msg === 'Session ended') s.end = l.time;
    byId.set(l.sessionId, s);
  }
  return [...byId.values()];
}

/** Who a caller is for review purposes, or null when they must not be reviewed. */
export function userKind(uid, optedIn = new Set()) {
  if (!uid) return null;
  if (uid === (process.env.REVIEW_OWNER_UID ?? SETH_UID)) return 'owner';
  if (uid.startsWith('voice-eval-')) return 'eval';
  if (optedIn.has(uid)) return 'opt-in';
  return null;
}

/**
 * The lines that belong to one session: its own sessionId lines, plus lines
 * with no sessionId from its pod and time span, unless another session was
 * live on that pod then (those can't be attributed, so they are dropped).
 */
export function linesOf(session, lines, others) {
  const end = (session.end ?? session.start + 3_600_000) + TAIL_MS;
  const busy = others.filter((o) => o.id !== session.id && o.host === session.host);
  const shared = (t) =>
    busy.some((o) => t >= o.start && t <= (o.end ?? o.start + 3_600_000) + TAIL_MS);
  let interleaved = false;
  const own = lines.filter((l) => {
    if (l.time < session.start - 5000 || l.time > end) return false;
    if (l.sessionId) return l.sessionId === session.id;
    if (l.host !== session.host) return false;
    if (shared(l.time)) {
      interleaved = true;
      return false;
    }
    return true;
  });
  return { lines: own, interleaved };
}

const ssml = (t) =>
  t
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The call as [{ t, who: 'agent'|'user', text }] with t in ms from session start. */
export function timelineOf(session, lines) {
  const out = [];
  for (const l of lines) {
    const t = l.time - session.start;
    if (l.msg === 'Processing user turn' && l.preview)
      out.push({ t, who: 'user', text: l.preview });
    else if (l.trace === 'E2E_TTS_OUTPUT' && l.ttsText && !l.isEmpty) {
      const text = ssml(l.ttsText);
      if (text) out.push({ t, who: 'agent', text });
    }
  }
  return out;
}

/** judge.mjs / humanness.mjs run format, with the director's notes and tool calls. */
export function runOf(session, timeline, lines, meta) {
  const firstUser = timeline.find((e) => e.who === 'user');
  const at = (l) => l.time - session.start;
  return {
    meta,
    events: timeline,
    userSpeech: firstUser ? [[firstUser.t, firstUser.t]] : [],
    notes: lines
      .filter((l) => l.msg === 'DIRECTOR_NOTES' && l.notes?.length)
      .map((l) => ({ t: at(l), notes: l.notes })),
    tools: lines
      .filter((l) => l.msg === 'TOOL_RETRIEVAL_COVERAGE')
      .map((l) => ({ t: at(l), tool: l.tool })),
  };
}

export const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const PRESENCE_LINE = /\b(still there|you there|lose you|lost you)\b|^mm\?$/i;
const CRISIS_LINE = /\b(988|crisis (life)?line|suicide)\b/i;

/** What a call's log lines say about how human it sounded. */
export function callMetrics(timeline, lines) {
  const by = (m) => lines.filter((l) => l.msg === m);
  const tm = by('TURN_METRICS');
  const num = (xs) => xs.filter((x) => typeof x === 'number');
  const measured = num(by('REPLY_GAP').map((l) => l.stopToAudioMs));
  // Builds before REPLY_GAP: end of turn + LLM first token + TTS first byte, a lower bound.
  const estimated = num(
    tm.map((l) =>
      typeof l.eouDelayMs === 'number' && typeof l.llmTtftMs === 'number'
        ? l.eouDelayMs + l.llmTtftMs + (l.ttsTtfbMs ?? 0)
        : null
    )
  );
  const gaps = measured.length ? measured : estimated;
  const len = (role) =>
    lines
      .filter((l) => l.role === role && typeof l.contentLen === 'number')
      .reduce((a, l) => a + l.contentLen, 0);
  const userChars = len('user');
  const agentChars = len('assistant');
  const words = (who) =>
    timeline.filter((e) => e.who === who).reduce((a, e) => a + e.text.split(/\s+/).length, 0);
  const classifier = by('CRISIS_CLASSIFIER');
  const tools = by('TOOL_RETRIEVAL_COVERAGE').map((l) => l.tool);
  const summary = summaryOutcome(lines);
  const notes = by('DIRECTOR_NOTES').filter((l) => l.notes?.length);
  const lanes = by('FAST_LANE');
  const count = (xs, k) => xs.reduce((o, x) => ({ ...o, [x[k]]: (o[x[k]] ?? 0) + 1 }), {});
  return {
    // ms from the caller stopping to Ferni's first audio (REPLY_GAP stopToAudioMs)
    replyGapMs: {
      p50: pct(gaps, 50),
      p90: pct(gaps, 90),
      first: gaps[0] ?? null,
      n: gaps.length,
      source: measured.length ? 'reply-gap' : estimated.length ? 'turn-metrics-estimate' : null,
    },
    stages: {
      eouDelayMsP50: pct(num(tm.map((l) => l.eouDelayMs)), 50),
      llmTtftMsP50: pct(num(tm.map((l) => l.llmTtftMs)), 50),
    },
    // caller characters / all characters (persistTurn contentLen); words from the timeline if absent
    callerTalkShare:
      userChars + agentChars
        ? Math.round((userChars / (userChars + agentChars)) * 100) / 100
        : words('user') + words('agent')
          ? Math.round((words('user') / (words('user') + words('agent'))) * 100) / 100
          : null,
    // Caller previews carry no sessionId and are dropped when sessions interleave;
    // the memory buffer's per-turn line carries one, so it still counts the turns.
    callerTurns: Math.max(
      timeline.filter((e) => e.who === 'user').length,
      new Set(
        lines
          .filter((l) => l.msg.includes('recordTurn START') && l.sessionId)
          .map((l) => l.turnNumber)
      ).size
    ),
    ferniTurns: timeline.filter((e) => e.who === 'agent').length,
    directorNotes: {
      notes: notes.reduce((a, l) => a + l.notes.length, 0),
      turnsWithNotes: notes.length,
      ignored: null, // judge-calls.mjs: replies that did what a note said not to
    },
    presence: {
      spokenChecks: timeline.filter((e) => e.who === 'agent' && PRESENCE_LINE.test(e.text)).length,
      sounds: count(
        lines.filter((l) => l.msg.startsWith('PRESENCE_SOUND')),
        'kind'
      ),
      noWordsReplies: lanes.filter((l) => l.reason === 'no_words').length,
    },
    crisis: {
      classified: classifier.length,
      disagreements: classifier.filter((l) => l.agree === false).length,
      flagged: classifier.filter((l) => l.risk && l.risk !== 'none').length,
      resourcesSpoken: timeline.filter((e) => e.who === 'agent' && CRISIS_LINE.test(e.text)).length,
    },
    summary,
    overlap: {
      bargeIns: by('BARGE_IN_DECISION').length,
      interruptions: by('BARGE_IN_DECISION').filter((l) => l.isInterruption).length,
      falseInterruptions: by('BARGE_IN_FALSE_INTERRUPTION').length,
      backchannelLate: null, // not in the agent logs yet (#706 measures it on eval recordings)
    },
    fastLane: count(lanes, 'lane'),
    moves: count(by('TURN_SHAPE'), 'move'),
    tools: { calls: tools.length, names: [...new Set(tools)] },
    fallbacks: {
      summary: summary.fallback ? 1 : 0,
      hedgedBackupWins: by('hedged reply').filter((l) => l.winner === 'backup').length,
      generateReplyFailed: by('❌ generateReply failed').length,
      directorNoReply: by('director gave no reply').length,
    },
  };
}

/**
 * Where the end-of-call summary came from. Newer builds log source on the
 * outcome line; older ones logged "Operation timed out, using fallback" ten
 * seconds after every summary, even ones that finished in time, so the
 * timeout line alone is not a fallback.
 */
export function summaryOutcome(lines) {
  const ok = lines.find((l) => l.msg === '✅ LLM summarization succeeded');
  const extracted = lines.find((l) => l.msg === '✅ Extraction summarization succeeded');
  const failed = lines.find((l) => /All summarization methods failed/.test(l.msg));
  const sourced = [ok, extracted, failed].find((l) => l?.source);
  if (sourced) return { source: sourced.source, fallback: sourced.source !== 'llm' };
  if (failed) return { source: 'none', fallback: true };
  if (extracted) return { source: 'fallback', fallback: true };
  if (ok) return { source: 'llm', fallback: false };
  const timedOut = lines.some(
    (l) => l.msg === 'Operation timed out, using fallback' && l.operation === 'summarizeWithLLM'
  );
  return timedOut ? { source: 'fallback', fallback: true } : { source: null, fallback: null };
}

function gcloudJson(args) {
  const out = execFileSync('gcloud', args, { encoding: 'utf8', maxBuffer: 1 << 30 });
  return out.trim() ? JSON.parse(out) : [];
}

function readLogs(worker, since, until, extra = '') {
  const filter = `logName="${LOG}" AND textPayload:"${worker}" AND timestamp>="${since}" AND timestamp<="${until}"${extra}`;
  return parseEntries(
    gcloudJson([
      'logging',
      'read',
      filter,
      `--project=${PROJECT}`,
      '--format=json',
      '--limit=200000',
    ])
  );
}

/** Callers who set bogle_users/{uid}.callReviewOptIn to true; only that field is read. */
function optedIn(uids, database) {
  const out = new Set();
  if (!uids.length) return out;
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  for (const uid of uids) {
    const url = `${documentsUrl(PROJECT, database)}/bogle_users/${encodeURIComponent(uid)}?mask.fieldPaths=callReviewOptIn`;
    try {
      const body = JSON.parse(
        execFileSync('curl', ['-sf', '-H', `Authorization: Bearer ${token}`, url], {
          encoding: 'utf8',
        })
      );
      if (body.fields?.callReviewOptIn?.booleanValue === true) out.add(uid);
    } catch {
      // no doc, or no access: not opted in
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const until = opt('--until', new Date().toISOString());
  const since = opt('--since', new Date(Date.parse(until) - 86_400_000).toISOString());
  const envs = opt('--env', 'both') === 'both' ? ['prod', 'dev'] : [opt('--env')];
  const date = until.slice(0, 10);
  const dir = join(opt('--out', join(homedir(), 'Documents/voiceai-evidence/call-reviews')), date);
  mkdirSync(join(dir, 'runs'), { recursive: true });
  const calls = [];
  let skipped = 0;
  for (const env of envs) {
    const worker = WORKERS[env];
    const index = indexSessions(
      readLogs(
        worker,
        since,
        until,
        ' AND (textPayload:"Session language initialized" OR textPayload:"Session ended")'
      )
    );
    const unknown = [
      ...new Set(
        index.map((s) => s.userId).filter((u) => u && !userKind(u) && !u.startsWith('anon'))
      ),
    ];
    const optIns = optedIn(unknown, evalDatabase(env, { override: opt('--database') }));
    for (const s of index) {
      const kind = userKind(s.userId, optIns);
      if (!kind) {
        skipped += 1;
        continue;
      }
      const end = new Date((s.end ?? s.start + 3_600_000) + TAIL_MS).toISOString();
      const all = readLogs(worker, new Date(s.start - 5000).toISOString(), end);
      const { lines, interleaved } = linesOf(s, all, index);
      const timeline = timelineOf(s, lines);
      if (!timeline.length) continue;
      const runFile = join('runs', `${s.id}.json`);
      const meta = { sessionId: s.id, env, userKind: kind, source: 'cloud-logs' };
      writeFileSync(join(dir, runFile), JSON.stringify(runOf(s, timeline, lines, meta), null, 2));
      calls.push({
        sessionId: s.id,
        env,
        userKind: kind,
        startedAt: new Date(s.start).toISOString(),
        endedAt: s.end ? new Date(s.end).toISOString() : null,
        durationSec: s.end ? Math.round((s.end - s.start) / 1000) : null,
        interleaved,
        metrics: callMetrics(timeline, lines),
        runFile,
      });
    }
  }
  const day = {
    date,
    window: { since, until },
    generatedAt: new Date().toISOString(),
    skipped,
    calls,
  };
  writeFileSync(join(dir, 'calls.json'), JSON.stringify(day, null, 2));
  for (const c of calls) {
    const m = c.metrics;
    console.log(
      `${c.env} ${c.userKind} ${c.sessionId}: gap p50 ${m.replyGapMs.p50} p90 ${m.replyGapMs.p90}, caller share ${m.callerTalkShare}, presence ${m.presence.spokenChecks}, crisis disagree ${m.crisis.disagreements}, summary ${m.summary.source}`
    );
  }
  console.log(`${calls.length} call(s) reviewed, ${skipped} skipped -> ${dir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
