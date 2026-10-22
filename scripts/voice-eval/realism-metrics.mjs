#!/usr/bin/env node
// Turn-taking under a realistic caller (caller-realism.mjs), measured on one run's audio timeline.
//
// usage:
//   realism-metrics.mjs <run.json>          one call's metrics as JSON (run.sh writes <run>.realism.json)
//   realism-metrics.mjs pauses <clip>...    the mid-turn pauses in rendered caller clips (.pcm 48 kHz or .wav)
//   realism-metrics.mjs paired <A-dir> <B-dir> [--scenarios N]   build A vs B on these metrics (paired.mjs)
//
// Per call, from the caller's clips (where its pauses are) and Ferni's reply-voice track intervals:
//   takeoverRate   of the caller's mid-turn pauses (silence of MIN_PAUSE_MS+ inside a scripted
//                  turn), the share in which Ferni's voice started: he cut in while they were thinking
//   falseEndRate   of the scripted turns with a pause, the share where Ferni's voice started any time
//                  between the first pause and the caller's last word: the turn was ended early, even
//                  when the reply landed after the caller had started again
//   gapMs          p50/p90, caller's last word to Ferni's next voice (not talked over, ≤ ANSWER_WINDOW_MS)
//   bargeInStopMs  p50/p90, onset of an @interrupt said while Ferni talked to the end of that voice stretch
// Ferni's voice is his reply track. A stretch ≤ BACKCHANNEL_MAX_MS in a pause may be a clip or a reply
// cut at once: counted apart (shortInPauses), not as a takeover. Gaps count every onset.
// `values` ("rt:*") is pairedCompare's per-call input: concatenate realismValues(dir) with
// sweepValues(dir) for a release check. No meta/events, so loadSweep skips the file.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { formatPaired, pairedCompare } from './paired.mjs';
import { callOf } from './predicates/call.mjs';
import { callerPhrases, readWavPcm } from './presence.mjs';
import { pct } from './review-calls.mjs';

export const MIN_PAUSE_MS = 400;
export const BACKCHANNEL_MAX_MS = 600;
export const ANSWER_WINDOW_MS = 15000;

/** Silences of MIN_PAUSE_MS+ between the phrases of one caller clip, [startMs, endMs] from its start. */
export function clipPauses(pcm, rate = 48000) {
  const ph = callerPhrases(pcm, rate, 0);
  const out = [];
  for (let i = 1; i < ph.length; i++) if (ph[i][0] - ph[i - 1][1] >= MIN_PAUSE_MS) out.push([ph[i - 1][1], ph[i][0]]);
  return out;
}

export function readClip(file) {
  if (file.endsWith('.wav')) return readWavPcm(file);
  const buf = readFileSync(file);
  return { pcm: new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 2))), rate: 48000 };
}

const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : null);
const dist = (xs) => ({ p50: pct(xs, 50), p90: pct(xs, 90), n: xs.length });

/**
 * utterances: [{ start, end, mode: ''|'backchannel'|'interrupt', pauses: [[a, b] ms from start] }];
 * agentVoice: [[start, end]] Ferni's reply voice. All on the run clock.
 */
export function realismOfTimeline(utterances, agentVoice) {
  const voice = [...agentVoice].sort((a, b) => a[0] - b[0]);
  const onsets = voice.filter(([s, e]) => e - s > BACKCHANNEL_MAX_MS).map(([s]) => s);
  const blips = voice.filter(([s, e]) => e - s <= BACKCHANNEL_MAX_MS).map(([s]) => s);
  const startsIn = (a, b, ts = onsets) => ts.some((t) => t >= a && t < b);
  let [pauses, takeovers, pausedTurns, falseEnds, shortInPauses] = [0, 0, 0, 0, 0];
  const [gaps, stops] = [[], []];
  for (const u of utterances) {
    if (u.mode === 'interrupt') {
      const seg = voice.find(([s, e]) => s <= u.start && e > u.start);
      if (seg) stops.push(seg[1] - u.start);
    }
    if (u.mode) continue; // talk-over lines are not turns
    const abs = u.pauses.map(([a, b]) => [u.start + a, u.start + b]);
    pauses += abs.length;
    takeovers += abs.filter(([a, b]) => startsIn(a, b)).length;
    shortInPauses += abs.filter(([a, b]) => startsIn(a, b, blips)).length;
    if (abs.length) {
      pausedTurns++;
      if (startsIn(abs[0][0], u.end)) falseEnds++;
    }
    const talking = voice.some(([s, e]) => s < u.end && e > u.end);
    const next = voice.find(([s]) => s >= u.end)?.[0];
    if (!talking && next !== undefined && next - u.end <= ANSWER_WINDOW_MS) gaps.push(next - u.end);
  }
  return {
    pauses,
    takeovers,
    takeoverRate: rate(takeovers, pauses),
    pausedTurns,
    falseEnds,
    falseEndRate: rate(falseEnds, pausedTurns),
    gapMs: dist(gaps),
    bargeInStopMs: dist(stops),
    shortInPauses,
  };
}

/** The scripted utterances of a converse.mjs run, with each turn's pauses read from its clip. */
export function utterancesOf(run, pausesOf) {
  const spoken = (run.results ?? []).filter((r) => /\.pcm$/.test(r.turn ?? ''));
  return (run.userSpeech ?? []).map(([start, end], k) => {
    const r = spoken[k] ?? {};
    return { start, end, mode: r.mode ?? '', pauses: r.mode || !r.turn ? [] : pausesOf(r.turn) };
  });
}

export function realismOfRun(run) {
  const dir = run.meta?.audio;
  if (!dir) throw new Error('realism-metrics: run has no meta.audio (run.sh --realistic writes it)');
  const m = realismOfTimeline(
    utterancesOf(run, (turn) => {
      const { pcm, rate: hz } = readClip(join(dir, turn));
      return clipPauses(pcm, hz);
    }),
    callOf(run).agentVoice
  );
  const values = {
    'rt:takeover-rate': m.takeoverRate,
    'rt:false-end-rate': m.falseEndRate,
    'rt:gap-p50-ms': m.gapMs.p50,
    'rt:gap-p90-ms': m.gapMs.p90,
    'rt:barge-in-stop-p50-ms': m.bargeInStopMs.p50,
  };
  return { schema: 'voice-eval-realism/1', scenario: run.meta.scenario, label: run.meta.label, persona: run.meta.realism ?? '', ...m, values };
}

/** Every <run>.realism.json under dir, as pairedCompare input. */
export function realismValues(dir) {
  return readdirSync(dir, { recursive: true })
    .map((p) => join(dir, p))
    .filter((p) => p.endsWith('.realism.json') && statSync(p).isFile())
    .map((p) => JSON.parse(readFileSync(p, 'utf8')))
    .map((r) => ({ scenario: r.scenario, values: r.values }));
}

function main(args) {
  if (args[0] === 'pauses') {
    for (const f of args.slice(1)) {
      const { pcm, rate: hz } = readClip(f);
      console.log(JSON.stringify({ clip: f, ms: Math.round((pcm.length / hz) * 1000), pauses: clipPauses(pcm, hz) }));
    }
    return;
  }
  if (args[0] === 'paired') {
    const at = args.indexOf('--scenarios');
    const scenarios = at > 0 ? Number(args.splice(at, 2)[1]) : undefined;
    return console.log(formatPaired(pairedCompare(realismValues(args[1]), realismValues(args[2]), { scenarios })));
  }
  if (args.length !== 1) {
    console.error('usage: realism-metrics.mjs <run.json> | pauses <clip>... | paired <A-dir> <B-dir> [--scenarios N]');
    process.exit(2);
  }
  console.log(JSON.stringify(realismOfRun(JSON.parse(readFileSync(args[0], 'utf8'))), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
