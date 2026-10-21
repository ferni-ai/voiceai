#!/usr/bin/env node
// The better-than-human scorecard: one JSON with every dimension, its human
// baseline, its target, today's value on real prod calls and on dev eval
// calls, and a 14-day trend. A page is built from this file.
//
// usage: scorecard.mjs [--days 14] [--out FILE] [--database ID]
//   (default out: ~/Documents/voiceai-evidence/scorecard/scorecard.json)
//   --database: the Firestore database holding the owner's records (default
//   FIRESTORE_DATABASE, else '(default)', which is prod).
//
// Sources, all local except follow-through:
// - call-reviews/<date>/calls.json (review-calls.mjs + judge-calls.mjs):
//   prodReal = prod calls from Seth or opted-in callers, devEval = dev calls
//   from voice-eval accounts;
// - eval runs in voiceai-evidence/<dir>/*.json (run.sh/converse.mjs) with
//   their .judge.json and .score.json: feeling and recall on dev, and
//   backchannel timing once score.mjs carries presence (#706);
// - bogle_users/<owner>/ferni_commitments in Firestore (read-only): promises
//   whose due time fell in the window, kept vs missed (promise-keeper.ts);
// - bogle_users/<owner>/coach_media_picks in Firestore (read-only, fields
//   masked to timestamps and outcomes, never titles or links): coaching picks
//   Ferni offered and what became of them (COACH_MEDIA, coach-media/pick-log.ts);
// - panel/*.json: Ferni Listening Panel reports (ferni-rater/tools/score_round.py
//   output, saved by the weekly panel review): blind human 1-5 "sounds like a
//   real person" scores, the headline because people, not a judge, give them.
//
// Schema (scorecard.json):
// { generatedAt, windowDays, sources: { callReviewDays, evalRuns, panelReports },
//   dimensions: { <name>: {
//     label, unit, better: 'higher'|'lower',
//     human: { value, range?, source } | null   (null: no published baseline),
//     target: { value, why },
//     current: { prodReal: { value, n } | null, devEval: { value, n } | null },
//       (followThrough adds due: promises that fell due, settled or not;
//        humanPanel's n is listeners and it adds round;
//        coachFollowUpLanded adds due like followThrough)
//     trend: [{ date, prodReal, devEval }]       (one row per day with data)
//   } } }
// value is the median (or rate) over calls in the window; n is how many calls
// or items it rests on. A null value means nothing measured it yet.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { documentsUrl } from './eval-database.mjs';
import { checkRun, parseChecks } from './recall-facts.mjs';

const EVIDENCE = process.env.VOICE_EVIDENCE ?? join(homedir(), 'Documents/voiceai-evidence');
const OWNER = process.env.REVIEW_OWNER_UID ?? 'vdSfkCCXaiXpnVCvgKxHMYrNFr72';
const PROJECT = process.env.GCP_PROJECT ?? 'johnb-2025';
const SCENARIOS = new URL('./scenarios/', import.meta.url);
const MIN_CALLER_TURNS = 4;
const FELT = ['feltUnderstood', 'feltValidated', 'feltCaredFor'];
// Judge dimensions read straight from judge.mjs scores.
const JUDGED = [...FELT, 'callbackTact'];
const ANCHOR = {
  value: 3,
  source: 'judge.mjs anchor: 3 = a good human friend (a wording, not a measured friend)',
};

/** Each dimension's definition; value(call) reads one reviewed call or eval run. */
export const DIMENSIONS = {
  humanPanel: {
    label: 'Blind listeners: sounds like a real person (1 robotic, 4 mostly real, 5 a real friend)',
    unit: 'score 1-5',
    better: 'higher',
    human: null, // measured from the round's real-person clip when it has one (panelOf)
    target: { value: 4, why: "the panel's own scale: 4 = mostly real" },
  },
  speed: {
    label: 'Reply gap p50 (caller stops to Ferni heard)',
    unit: 'ms',
    better: 'lower',
    human: {
      value: 380,
      range: [200, 500],
      source: 'human-baselines gap_median_ms; cross-language FTO 7-469 ms (Stivers 2009)',
    },
    target: { value: 500, why: 'inside the human range' },
  },
  listening: {
    label: "Caller's share of the talking",
    unit: 'share',
    better: 'higher',
    human: { value: 0.5, source: 'assumed even split between two friends; not measured' },
    target: { value: 0.6, why: 'a better-than-human listener lets the caller talk more' },
  },
  ...Object.fromEntries(
    FELT.map((k) => [
      k,
      {
        label: `Judge: ${k}`,
        unit: 'score 1-5',
        better: 'higher',
        human: ANCHOR,
        target: { value: 4, why: 'judge anchor 4 = better than most friends' },
      },
    ])
  ),
  callbackTact: {
    label: 'Judge: callbacks to an earlier call feel natural, not watched',
    unit: 'score 1-5',
    better: 'higher',
    human: ANCHOR,
    target: { value: 4, why: 'judge anchor 4 = better than most friends' },
  },
  recall: {
    label: 'Facts from the earlier call recalled unprompted',
    unit: 'rate',
    better: 'higher',
    human: null,
    target: { value: 0.9, why: 'better than a friend remembers' },
  },
  followThrough: {
    label: "Ferni's promises kept by their due time",
    unit: 'rate',
    better: 'higher',
    human: null,
    target: { value: 0.95, why: 'a friend who never forgets' },
  },
  honesty: {
    label: 'Fabricated claims per call (actions with no tool call + judge-flagged faked knowledge)',
    unit: 'per call',
    better: 'lower',
    human: null,
    target: { value: 0, why: 'never claim what did not happen' },
  },
  backchannelTiming: {
    label: 'Mid-turn backchannel heard after the caller pauses, p50',
    unit: 'ms',
    better: 'lower',
    human: null,
    target: { value: 500, why: 'presence.mjs target (Heinz 2003 via human-baselines)' },
  },
  fallbacks: {
    label: 'Fallbacks per call (summary fallback, failed generateReply, director gave no reply)',
    unit: 'per call',
    better: 'lower',
    human: null,
    target: { value: 0, why: 'every fallback is a degraded moment' },
  },
  // Coaching picks (coach_media_picks). Rates are dated by the event they are
  // about: tried/helpful by when the follow-up was answered, landed by when it
  // fell due, time-to-pick by when the pick was offered.
  coachTriedRate: {
    label: 'Recommendations the caller tried (of follow-ups answered done or not done)',
    unit: 'rate',
    better: 'higher',
    human: null,
    target: { value: 0.6, why: "assumed: no published baseline for friends' tips being tried" },
  },
  coachHelpfulRate: {
    label: 'Recommendations that helped ("somewhat" counts 0.5)',
    unit: 'rate',
    better: 'higher',
    human: null,
    target: { value: 0.7, why: 'assumed: no published baseline; "somewhat" counts as 0.5' },
  },
  coachFollowUpLanded: {
    label: 'Sent recommendations whose follow-up was asked within 7 days of falling due',
    unit: 'rate',
    better: 'higher',
    human: null,
    target: {
      value: 0.9,
      why:
        'a friend who checks back; assumed, not measured. A follow-up is asked on the first call ' +
        'after it falls due, so one due in the last 7 days with no call since reads as a miss',
    },
  },
  coachTimeToPick: {
    label: 'Time to the first checked recommendation in a call, p50',
    unit: 'ms',
    better: 'lower',
    human: null,
    target: { value: 4000, why: '4000 ms is a guess pending a dev measurement' },
  },
};

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100;
};
const mean = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const summarize = (xs) => {
  const vals = xs.filter((x) => typeof x === 'number');
  return vals.length ? { value: median(vals), n: vals.length } : null;
};

/** One reviewed call's value per dimension (call-reviews calls.json record). */
export function reviewedValues(call) {
  const m = call.metrics;
  // An app opened and closed without a conversation says nothing about Ferni.
  if ((m.callerTurns ?? 0) < MIN_CALLER_TURNS) return {};
  const f = m.fallbacks ?? {};
  const felt = Object.fromEntries(JUDGED.map((k) => [k, call.judge?.scores?.[k] ?? null]));
  return {
    speed: m.replyGapMs?.source === 'reply-gap' ? m.replyGapMs.p50 : null,
    listening: m.callerTalkShare,
    ...felt,
    honesty:
      typeof m.unbackedActionClaims === 'number'
        ? m.unbackedActionClaims + (call.judge?.fakedKnowledge ?? 0)
        : null,
    fallbacks: (f.summary ?? 0) + (f.generateReplyFailed ?? 0) + (f.directorNoReply ?? 0),
  };
}

/** One eval run's values: feeling from its judge verdict, recall, backchannel timing. */
export function evalValues(run, judge, score) {
  const out = Object.fromEntries(JUDGED.map((k) => [k, judge?.scores?.[k] ?? null]));
  const scenario = run.meta?.scenario;
  const file = scenario && new URL(`${scenario}.txt`, SCENARIOS);
  if (file && existsSync(file)) {
    const checks = parseChecks(readFileSync(file, 'utf8'));
    if (checks.some((c) => c.kind === 'fact')) out.recall = checkRun(run, checks).rate;
  }
  out.backchannelTiming = score?.presence?.bcHeardOffsetMs?.p50 ?? null;
  return out;
}

/** Promises due in [since, until): kept / (kept + missed), by due date. */
export function followThroughOf(promises, since, until) {
  const due = promises.filter((p) => p.dueBy && p.dueBy >= since && p.dueBy < until);
  const byDate = {};
  for (const p of due) {
    const d = (byDate[p.dueBy.slice(0, 10)] ??= { kept: 0, missed: 0 });
    if (p.outcome === 'kept') d.kept += 1;
    if (p.outcome === 'missed') d.missed += 1;
  }
  const rate = (d) =>
    d.kept + d.missed ? Math.round((d.kept / (d.kept + d.missed)) * 100) / 100 : null;
  const all = Object.values(byDate).reduce(
    (a, d) => ({ kept: a.kept + d.kept, missed: a.missed + d.missed }),
    { kept: 0, missed: 0 }
  );
  return {
    // value null with due 0: nothing fell due, which is not the same as not measured
    overall: { value: rate(all), n: all.kept + all.missed, due: due.length },
    byDate: Object.fromEntries(Object.entries(byDate).map(([k, d]) => [k, rate(d)])),
  };
}

/** Rows [{ date, side: 'prodReal'|'devEval', values }] -> current + trend per dimension. */
/**
 * Panel reports [{ date, report }] -> the latest round's score and one trend
 * row per report. A round's score is the mean of its versions' human scores;
 * a report with no listeners is not a measurement.
 */
export function panelOf(reports) {
  // build_round.py's real-person clip is the arm whose flags read HUMAN_REFERENCE=<source>.
  const isPerson = (r) => String(r['what changed'] ?? '').startsWith('HUMAN_REFERENCE');
  const score = (rows) =>
    rows.length
      ? Math.round(mean(rows.map((r) => Number.parseFloat(r['human score']))) * 100) / 100
      : null;
  const scored = reports
    .filter(({ report }) => report.listeners > 0 && report.rows?.some((r) => !isPerson(r)))
    .map(({ date, report }) => ({
      date,
      round: report.round,
      listeners: report.listeners,
      value: score(report.rows.filter((r) => !isPerson(r))),
      person: score(report.rows.filter(isPerson)),
      source: report.rows.find(isPerson)?.['what changed'].split('=')[1],
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = scored.at(-1);
  return {
    current: last ? { value: last.value, n: last.listeners, round: last.round } : null,
    // The same listeners scoring a real person in the same round: a measured baseline.
    human:
      last?.person != null
        ? {
            value: last.person,
            source: `panel round ${last.round}: real-person clip (${last.source})`,
          }
        : null,
    trend: scored.map((x) => ({ date: x.date, prodReal: null, devEval: x.value })),
  };
}

/**
 * Coaching picks [{ offeredAt, firstInCall, latencyMs, sentAt, followUpDueAt,
 * followUpAskedAt, outcome, helped, answeredAt }] -> { <coach dimension>: { current, trend } }.
 * n is each rate's denominator; nothing to count gives value null, n 0.
 */
const LANDED_DAYS = 7;

export function coachOf(picks, since, until) {
  const inWindow = (t) => typeof t === 'string' && t >= since && t < until;
  const round = (x) => Math.round(x * 100) / 100;
  const rate = (items, score) =>
    items.length ? round(items.reduce((a, p) => a + score(p), 0) / items.length) : null;
  /** One dimension: value(items) over the window, and per day by `dateOf`. */
  const dim = (items, dateOf, value, extra = () => ({})) => {
    const byDate = {};
    for (const p of items) (byDate[dateOf(p).slice(0, 10)] ??= []).push(p);
    return {
      current: {
        prodReal: { value: value(items), n: items.length, ...extra(items) },
        devEval: null,
      },
      trend: Object.keys(byDate)
        .sort()
        .map((date) => ({ date, prodReal: value(byDate[date]), devEval: null })),
    };
  };
  const tried = picks.filter(
    (p) => inWindow(p.answeredAt) && (p.outcome === 'done' || p.outcome === 'not_done')
  );
  const helped = picks.filter((p) => inWindow(p.answeredAt) && p.helped);
  const due = picks.filter((p) => p.sentAt && inWindow(p.followUpDueAt));
  const first = picks.filter(
    (p) => p.firstInCall && inWindow(p.offeredAt) && Number.isFinite(p.latencyMs)
  );
  const HELP = { yes: 1, somewhat: 0.5, no: 0 };
  // Asked on a call within LANDED_DAYS of falling due (it can't be asked before).
  const askedInTime = (p) => {
    if (typeof p.followUpAskedAt !== 'string') return 0;
    const late = Date.parse(p.followUpAskedAt) - Date.parse(p.followUpDueAt);
    return late >= 0 && late <= LANDED_DAYS * 86_400_000 ? 1 : 0;
  };
  return {
    coachTriedRate: dim(
      tried,
      (p) => p.answeredAt,
      (xs) => rate(xs, (p) => (p.outcome === 'done' ? 1 : 0))
    ),
    coachHelpfulRate: dim(
      helped,
      (p) => p.answeredAt,
      (xs) => rate(xs, (p) => HELP[p.helped] ?? 0)
    ),
    coachFollowUpLanded: dim(
      due,
      (p) => p.followUpDueAt,
      (xs) => rate(xs, askedInTime),
      (xs) => ({ due: xs.length })
    ),
    coachTimeToPick: dim(
      first,
      (p) => p.offeredAt,
      (xs) => median(xs.map((p) => p.latencyMs))
    ),
  };
}

export function assemble(
  rows,
  followThrough,
  meta,
  panel = { current: null, trend: [] },
  coach = {}
) {
  const dims = {};
  for (const [name, def] of Object.entries(DIMENSIONS)) {
    const pick = (side, date) =>
      rows.filter((r) => r.side === side && (!date || r.date === date)).map((r) => r.values[name]);
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    let current = { prodReal: summarize(pick('prodReal')), devEval: summarize(pick('devEval')) };
    let trend = dates
      .map((date) => ({
        date,
        prodReal: median(pick('prodReal', date)),
        devEval: median(pick('devEval', date)),
      }))
      .filter((t) => t.prodReal !== null || t.devEval !== null);
    if (name === 'humanPanel') {
      current = { prodReal: null, devEval: panel.current };
      trend = panel.trend;
      dims[name] = { ...def, human: panel.human ?? null, current, trend };
      continue;
    }
    if (name.startsWith('coach')) {
      // Until COACH_MEDIA writes picks, null with n 0: not measured, never 0.
      current = coach[name]?.current ?? {
        prodReal: { value: null, n: 0, ...(name === 'coachFollowUpLanded' ? { due: 0 } : {}) },
        devEval: null,
      };
      trend = coach[name]?.trend ?? [];
    }
    if (name === 'followThrough') {
      current = { prodReal: followThrough.overall, devEval: null };
      trend = Object.entries(followThrough.byDate)
        .sort()
        .map(([date, v]) => ({ date, prodReal: v, devEval: null }));
    }
    dims[name] = { ...def, current, trend };
  }
  return { generatedAt: new Date().toISOString(), ...meta, dimensions: dims };
}

const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

function reviewedRows(since) {
  const root = join(EVIDENCE, 'call-reviews');
  const rows = [];
  const days = existsSync(root)
    ? readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= since.slice(0, 10))
    : [];
  for (const d of days) {
    for (const c of readJson(join(root, d, 'calls.json'))?.calls ?? []) {
      const side =
        c.env === 'prod' && c.userKind !== 'eval'
          ? 'prodReal'
          : c.env === 'dev' && c.userKind === 'eval'
            ? 'devEval'
            : null;
      if (side) rows.push({ date: d, side, values: reviewedValues(c) });
    }
  }
  return { rows, days };
}

function evalRows(since) {
  const rows = [];
  const cutoff = Date.parse(since);
  for (const dir of readdirSync(EVIDENCE)) {
    const path = join(EVIDENCE, dir);
    if (dir === 'call-reviews' || !statSync(path).isDirectory() || statSync(path).mtimeMs < cutoff)
      continue;
    for (const f of readdirSync(path).filter(
      (x) => x.endsWith('.json') && !/\.(score|judge|seed|events)(\.\w+)?\.json$/.test(x)
    )) {
      const run = readJson(join(path, f));
      if (run?.meta?.env !== 'dev' || !run.meta.scenario || !Array.isArray(run.events)) continue;
      const at = typeof run.wallT0 === 'number' ? run.wallT0 : statSync(join(path, f)).mtimeMs;
      if (at < cutoff) continue;
      const side = (ext) => readJson(join(path, f.replace(/\.json$/, ext)));
      rows.push({
        date: new Date(at).toISOString().slice(0, 10),
        side: 'devEval',
        values: evalValues(run, side('.judge.json'), side('.score.json')),
      });
    }
  }
  return rows;
}

/** The owner's ferni_commitments (outcome, dueBy only), read with the gcloud user's token. */
function ownerPromises(database) {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const base = `${documentsUrl(PROJECT, database)}/bogle_users/${OWNER}/ferni_commitments?pageSize=300&mask.fieldPaths=outcome&mask.fieldPaths=dueBy`;
  const out = [];
  let page = '';
  do {
    const body = JSON.parse(
      execFileSync(
        'curl',
        [
          '-sf',
          '-H',
          `Authorization: Bearer ${token}`,
          `${base}${page ? `&pageToken=${page}` : ''}`,
        ],
        { encoding: 'utf8' }
      )
    );
    for (const d of body.documents ?? [])
      out.push({ outcome: d.fields?.outcome?.stringValue, dueBy: d.fields?.dueBy?.stringValue });
    page = body.nextPageToken ?? '';
  } while (page);
  return out;
}

const COACH_FIELDS = [
  'offeredAt',
  'firstInCall',
  'latencyMs',
  'sentAt',
  'followUpDueAt',
  'outcome',
  'helped',
  'answeredAt',
  'followUpAskedAt',
];

/** A Firestore REST value as plain JS; null when absent or null. */
export function firestoreValue(v) {
  if (!v || 'nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

/** The owner's coach_media_picks, masked to timestamps and outcomes (no titles, topics or links). */
function ownerPicks(database) {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const mask = COACH_FIELDS.map((f) => `mask.fieldPaths=${f}`).join('&');
  const base = `${documentsUrl(PROJECT, database)}/bogle_users/${OWNER}/coach_media_picks?pageSize=300&${mask}`;
  const out = [];
  // The token goes to curl in a 0600 header file, never on its command line.
  const dir = mkdtempSync(join(tmpdir(), 'scorecard-'));
  const header = join(dir, 'auth');
  writeFileSync(header, `Authorization: Bearer ${token}\n`, { mode: 0o600 });
  try {
    let page = '';
    do {
      const url = `${base}${page ? `&pageToken=${page}` : ''}`;
      const body = JSON.parse(
        execFileSync('curl', ['-sf', '-H', `@${header}`, url], { encoding: 'utf8' })
      );
      for (const d of body.documents ?? []) {
        const f = d.fields ?? {};
        out.push(Object.fromEntries(COACH_FIELDS.map((k) => [k, firestoreValue(f[k])])));
      }
      page = body.nextPageToken ?? '';
    } while (page);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

/** Panel reports saved in the window, dated by when they were saved. */
function panelReports(since) {
  const dir = join(EVIDENCE, 'panel');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, at: statSync(join(dir, f)).mtimeMs }))
    .filter(({ at }) => at >= Date.parse(since))
    .map(({ f, at }) => ({
      date: new Date(at).toISOString().slice(0, 10),
      report: readJson(join(dir, f)),
    }))
    .filter(({ report }) => report);
}

function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const days = Number(opt('--days', 14));
  const until = new Date().toISOString();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const out = opt('--out', join(EVIDENCE, 'scorecard/scorecard.json'));
  const database = opt('--database', process.env.FIRESTORE_DATABASE || '(default)');
  const reviewed = reviewedRows(since);
  const evals = evalRows(since);
  let follow = { overall: null, byDate: {} };
  try {
    follow = followThroughOf(ownerPromises(database), since, until);
  } catch (e) {
    console.error(`follow-through not read: ${e.message}`);
  }
  const reports = panelReports(since);
  let coach = {};
  try {
    coach = coachOf(ownerPicks(database), since, until);
  } catch (e) {
    console.error(`coaching picks not read: ${e.message}`);
  }
  const card = assemble(
    [...reviewed.rows, ...evals],
    follow,
    {
      windowDays: days,
      sources: {
        callReviewDays: reviewed.days,
        evalRuns: evals.length,
        panelReports: reports.length,
      },
    },
    panelOf(reports),
    coach
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(card, null, 2));
  for (const [k, d] of Object.entries(card.dimensions))
    console.log(
      `${k.padEnd(18)} prod ${JSON.stringify(d.current.prodReal)}  dev ${JSON.stringify(d.current.devEval)}  human ${d.human?.value ?? '-'}  target ${d.target.value}`
    );
  console.log(`scorecard -> ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
