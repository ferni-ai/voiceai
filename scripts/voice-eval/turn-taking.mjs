#!/usr/bin/env node
// Turn-taking scorecard: how Ferni shares the floor, from two sources.
//
// usage:
//   turn-taking.mjs logs [--env dev|prod] [--since ISO] [--until ISO] [--from FILE...]
//     Real calls, rebuilt from the agent's Cloud Logging lines (review-calls.mjs
//     rules: only Seth's and voice-eval calls are read). --from reads saved
//     `gcloud logging read --format=json` output instead of calling gcloud.
//   turn-taking.mjs runs <run.json>...
//     Scripted calls (run.sh / converse.mjs recordings): measured on the audio.
//
// Prints one JSON scorecard. Every metric says what it rests on (n) and, for
// log-based ones, whether it is a proxy. What people do, for reference: reply
// gaps cluster around 200 ms (Stivers 2009); a speaker who is talked over
// yields within a few hundred ms (Schegloff 2000); a backchannel lands at or
// just after the speaker's pause (Ward & Tsukahara 2000).
//
// Log metrics (per call, then pooled):
//   replyGapMs        REPLY_GAP stopToAudioMs: caller stops to Ferni heard
//   eouDelayMs        TURN_METRICS eouDelayMs: caller stops to the turn ending
//   falseInterruptions BARGE_IN_FALSE_INTERRUPTION per Ferni reply: Ferni went
//                     quiet for the caller and no words came. unresumed = the
//                     reply never came back (the caller heard silence)
//   bargeIns          BARGE_IN_DECISION isInterruption: yieldMs = how long
//                     Ferni kept talking before stopping; missedYield = over
//                     300 ms (BARGE_IN_FASTPATH fires only after 950 ms)
//   cutInProxy        the caller spoke again (not a backchannel) within 2.5 s
//                     of Ferni's reply going to TTS: Ferni most likely took a
//                     mid-thought pause (or was barged in on at once)
//   backchannels      clips played, how many on the direct track (CLIP_WIRE),
//                     and its pause-to-wire time
// Run metrics: the reply gap, cut-offs (Ferni's voice starting inside a caller
// turn, by the length of the pause it started in), talk-over handling
// (@backchannel / @interrupt lines) and backchannel timing (presence.mjs).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { callerPhrases, presenceOfRuns, readWavPcm } from './presence.mjs';
import { indexSessions, linesOf, parseEntries, pct, userKind, WORKERS } from './review-calls.mjs';

const MISSED_YIELD_MS = 300;
const CUT_IN_MS = 2500;
const BACKCHANNEL_TEXT = /^(?:m+h*m*|h+m+|uhhuh|yeah|yep|yes|ok(?:ay)?|right|sure|oh|wow)[.!?]?$/;
const isBackchannelText = (t) =>
  BACKCHANNEL_TEXT.test(t.trim().toLowerCase().replace(/[-\s]/g, ''));
const PAUSE_BUCKETS = [200, 350, 500, 750, 1000, 1500, Infinity];

const dist = (xs) => ({ p10: pct(xs, 10), p50: pct(xs, 50), p90: pct(xs, 90), n: xs.length });
const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : null);
const nums = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));

/** One call's turn-taking from its log lines (time-ordered, as linesOf returns them). */
export function turnTakingOfLines(lines) {
  const by = (m) => lines.filter((l) => l.msg === m);
  const tm = by('TURN_METRICS');
  const gaps = nums(by('REPLY_GAP').map((l) => l.stopToAudioMs));
  const replies = Math.max(tm.length, gaps.length, by('TURN_RECEIPT').length);
  const fi = by('BARGE_IN_FALSE_INTERRUPTION');
  const decisions = by('BARGE_IN_DECISION');
  const real = decisions.filter((l) => l.isInterruption);
  const yieldMs = nums(real.map((l) => l.detectionDelayS * 1000));
  const fast = by('BARGE_IN_FASTPATH');
  const clips = lines.filter((l) =>
    /^(backchannel clip played|LAUGH_ALONG clip played)$/.test(l.msg)
  );
  const wires = by('CLIP_WIRE');
  // The caller talking again within CUT_IN_MS of Ferni's reply going to TTS
  // (TURN_METRICS.interrupted is never set, so the timeline is the signal).
  const cutIns = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].msg !== 'Processing user turn') continue;
    const reply = lines
      .slice(i + 1)
      .find((l) => l.trace === 'E2E_TTS_OUTPUT' || l.msg === 'Processing user turn');
    if (reply?.trace !== 'E2E_TTS_OUTPUT') continue;
    const next = lines
      .slice(lines.indexOf(reply) + 1)
      .find((l) => l.msg === 'Processing user turn');
    if (next && next.time - reply.time < CUT_IN_MS && !isBackchannelText(next.preview ?? ''))
      cutIns.push(next.time - reply.time);
  }
  const receipts = by('TURN_RECEIPT');
  return {
    callerTurns: by('Processing user turn').length,
    replies,
    replyGapMs: gaps,
    eouDelayMs: nums(tm.map((l) => l.eouDelayMs)),
    falseInterruptions: { n: fi.length, unresumed: fi.filter((l) => l.resumed === false).length },
    // Newer builds only: a reply that finished without any audio and wasn't interrupted.
    silentReplies: receipts.filter(
      (l) => l.timing && l.timing.firstAudioMs === null && l.reply && !l.reply.interrupted
    ).length,
    bargeIns: {
      decisions: decisions.length,
      n: real.length,
      yieldMs,
      fastPath: fast.length,
      missedYield: yieldMs.filter((x) => x > MISSED_YIELD_MS).length,
    },
    interruptedReplies: receipts.filter((l) => l.reply?.interrupted).length,
    cutInProxy: cutIns.length,
    backchannels: {
      played: clips.length,
      direct: wires.length,
      pauseToWireMs: nums(wires.map((l) => l.pauseToWireMs)),
      playToWireMs: nums(wires.map((l) => l.playToWireMs)),
    },
  };
}

/** Pool per-call log metrics into one scorecard. */
export function poolLogCalls(calls) {
  const all = (f) => calls.flatMap(f);
  const sum = (f) => calls.reduce((n, c) => n + f(c), 0);
  const replies = sum((c) => c.replies);
  const yieldMs = all((c) => c.bargeIns.yieldMs);
  const bargeIns = sum((c) => c.bargeIns.n);
  const fastPath = sum((c) => c.bargeIns.fastPath);
  const fi = sum((c) => c.falseInterruptions.n);
  const played = sum((c) => c.backchannels.played);
  return {
    source: 'logs',
    calls: calls.length,
    callerTurns: sum((c) => c.callerTurns),
    replies,
    replyGapMs: dist(all((c) => c.replyGapMs)),
    eouDelayMs: dist(all((c) => c.eouDelayMs)),
    falseInterruptions: {
      n: fi,
      perReply: rate(fi, replies),
      unresumed: sum((c) => c.falseInterruptions.unresumed),
      callsWithAny: calls.filter((c) => c.falseInterruptions.n > 0).length,
    },
    silentReplies: sum((c) => c.silentReplies),
    bargeIns: {
      decisions: sum((c) => c.bargeIns.decisions),
      n: bargeIns,
      perReply: rate(bargeIns, replies),
      yieldMs: dist(yieldMs),
      // Each fast-path stop is one where the model had not stopped Ferni by 950 ms.
      missedYield: sum((c) => c.bargeIns.missedYield) + fastPath,
      missedYieldRate: rate(sum((c) => c.bargeIns.missedYield) + fastPath, bargeIns + fastPath),
      fastPath,
    },
    interruptedReplies: sum((c) => c.interruptedReplies), // TURN_RECEIPT builds only
    cutInProxy: {
      n: sum((c) => c.cutInProxy),
      perCallerTurn: rate(
        sum((c) => c.cutInProxy),
        sum((c) => c.callerTurns)
      ),
    },
    backchannels: {
      played,
      direct: sum((c) => c.backchannels.direct),
      directShare: rate(
        sum((c) => c.backchannels.direct),
        played
      ),
      pauseToWireMs: dist(all((c) => c.backchannels.pauseToWireMs)),
      playToWireMs: dist(all((c) => c.backchannels.playToWireMs)),
    },
  };
}

/** Agent reply-voice segments of a recording (side tracks hold clips, not replies). */
const replyVoice = (run) =>
  run.tracks.filter((t) => !/background/i.test(t.name)).flatMap((t) => t.voice ?? []);

/**
 * Pauses inside each scripted caller turn, and whether Ferni's reply voice
 * started in them (a cut-off) or over the caller's next phrase.
 */
export function callerPauses(run, phrases) {
  const starts = replyVoice(run).map(([vs]) => vs);
  const out = [];
  for (const [s, e] of run.userSpeech) {
    const turn = phrases.filter(([a, b]) => b > s - 50 && a < e + 50);
    for (let i = 1; i < turn.length; i++) {
      const [from, to] = [turn[i - 1][1], turn[i][0]];
      out.push({ ms: to - from, cutOff: starts.some((vs) => vs >= from && vs < to) });
    }
  }
  return out;
}

/** Pool converse.mjs recordings into one scorecard. */
export function poolRuns(runs, readWav = readWavPcm) {
  const gaps = runs.flatMap((r) => nums(r.results.map((x) => x.replyDelayMs)));
  const pauses = [];
  let turns = 0;
  for (const run of runs) {
    turns += run.userSpeech.length;
    if (!run.mic?.file) continue;
    try {
      const wav = readWav(run.mic.file);
      pauses.push(...callerPauses(run, callerPhrases(wav.pcm, wav.rate, run.mic.startT)));
    } catch {
      // no mic recording on disk: no pauses from this run
    }
  }
  const overlaps = runs.flatMap((r) => r.results.filter((x) => x.mode && x.agentTalking));
  const bc = overlaps.filter((o) => o.mode === 'backchannel');
  const it = overlaps.filter((o) => o.mode === 'interrupt');
  const stopMs = nums(it.filter((o) => o.stopped).map((o) => o.stopLatencyMs));
  let lo = 0;
  const byPause = PAUSE_BUCKETS.map((hi) => {
    const inB = pauses.filter((p) => p.ms >= lo && p.ms < hi);
    const row = { fromMs: lo, toMs: hi === Infinity ? null : hi, pauses: inB.length };
    row.cutOffRate = rate(inB.filter((p) => p.cutOff).length, inB.length);
    lo = hi;
    return row;
  });
  return {
    source: 'runs',
    runs: runs.length,
    callerTurns: turns,
    replyGapMs: dist(gaps),
    cutOffs: {
      midTurnPauses: pauses.length,
      n: pauses.filter((p) => p.cutOff).length,
      rate: rate(pauses.filter((p) => p.cutOff).length, pauses.length),
      byPause,
    },
    // A backchannel that stopped Ferni is a false interruption.
    falseInterruptions: {
      backchannels: bc.length,
      stoppedFerni: bc.filter((o) => o.stopped && o.stopLatencyMs < 1500).length,
    },
    bargeIns: {
      n: it.length,
      yielded: stopMs.length,
      yieldMs: dist(stopMs),
      missedYield: it.filter((o) => !o.stopped || o.stopLatencyMs > MISSED_YIELD_MS).length,
    },
    backchannels: presenceOfRuns(runs, readWav),
  };
}

function gcloudEntries(worker, since, until) {
  const filter = `logName="projects/${process.env.GCP_PROJECT ?? 'johnb-2025'}/logs/cloud-agents" AND textPayload:"${worker}" AND timestamp>="${since}" AND timestamp<="${until}"`;
  const out = execFileSync(
    'gcloud',
    [
      'logging',
      'read',
      filter,
      `--project=${process.env.GCP_PROJECT ?? 'johnb-2025'}`,
      '--format=json',
      '--limit=300000',
    ],
    { encoding: 'utf8', maxBuffer: 1 << 30 }
  );
  return out.trim() ? JSON.parse(out) : [];
}

/** Per-call metrics for every reviewable session in `entries` (gcloud JSON). */
export function callsOfEntries(entries) {
  const lines = parseEntries(entries);
  const index = indexSessions(lines);
  const calls = [];
  for (const s of index) {
    const kind = userKind(s.userId);
    if (!kind) continue; // only Seth's and eval calls are ever read
    const own = linesOf(s, lines, index).lines;
    const m = turnTakingOfLines(own);
    if (m.callerTurns === 0 && m.replies === 0) continue;
    calls.push({
      sessionId: s.id,
      userKind: kind,
      startedAt: new Date(s.start).toISOString(),
      ...m,
    });
  }
  return calls;
}

function main() {
  const [mode, ...args] = process.argv.slice(2);
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  if (mode === 'runs') {
    const runs = args.map((f) => JSON.parse(readFileSync(f, 'utf8')));
    console.log(JSON.stringify(poolRuns(runs), null, 2));
    return;
  }
  if (mode !== 'logs') {
    console.error(
      'usage: turn-taking.mjs logs [--env dev|prod] [--since ISO] [--until ISO] [--from FILE...] | runs <run.json>...'
    );
    process.exit(2);
  }
  const at = args.indexOf('--from');
  const rest = at < 0 ? [] : args.slice(at + 1);
  const from = rest.slice(0, rest.findIndex((a) => a.startsWith('--')) >>> 0);
  let entries;
  if (from.length) entries = from.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
  else {
    const until = opt('--until', new Date().toISOString());
    const since = opt('--since', new Date(Date.parse(until) - 7 * 86_400_000).toISOString());
    entries = gcloudEntries(WORKERS[opt('--env', 'dev')], since, until);
  }
  const calls = callsOfEntries(entries);
  const who = opt('--who', 'all');
  const kept = who === 'all' ? calls : calls.filter((c) => c.userKind === who);
  console.log(
    JSON.stringify(
      {
        ...poolLogCalls(kept),
        who,
        byKind: Object.fromEntries(
          ['owner', 'eval'].map((k) => [k, poolLogCalls(calls.filter((c) => c.userKind === k))])
        ),
      },
      null,
      2
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
