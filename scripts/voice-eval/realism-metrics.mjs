#!/usr/bin/env node
// Turn-taking under a realistic caller, from each turn's clip (its pauses, its last word) and Ferni's
// reply-track voice. usage: realism-metrics.mjs <run.json> | pauses <clip>... | paired <A> <B> [--scenarios N]
//   takeoverRate   share of mid-turn caller pauses (MIN_PAUSE_MS+) in which Ferni's voice started
//   falseEndRate   share of paused turns where he started between the first pause and the last word
//   gapMs          p50/p90 last word to his next voice; unanswered turns count as ANSWER_WINDOW_MS
//   bargeInStopMs  p50/p90 from an @interrupt said while he talked to STOP_SILENCE_MS of his silence
// A stretch ≤ BACKCHANNEL_MAX_MS in a pause may be a clip (shortInPauses). No agent voice: null, never 0.
// `values` ("rt:*") is pairedCompare input, beside sweepValues; loadSweep skips it (no meta/events).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { formatPaired, pairedCompare } from './paired.mjs';
import { callOf } from './predicates/call.mjs';
import { callerPhrases, readWavPcm } from './presence.mjs';
import { pct } from './review-calls.mjs';

export const MIN_PAUSE_MS = 400;
export const BACKCHANNEL_MAX_MS = 600;
export const ANSWER_WINDOW_MS = 15000;
export const STOP_SILENCE_MS = 700; // converse.mjs: Ferni has stopped after 700 ms of silence

/** Silences of MIN_PAUSE_MS+ between phrases ([startMs, endMs] from the clip's start). */
const pausesOf = (ph) => ph.slice(1).map((p, i) => [ph[i][1], p[0]]).filter(([a, b]) => b - a >= MIN_PAUSE_MS);
export const clipPauses = (pcm, rate = 48000) => pausesOf(callerPhrases(pcm, rate, 0));

/** Voice stretches with gaps under STOP_SILENCE_MS joined: a breath is not a stop or a new start. */
const joined = (voice) =>
  [...voice].sort((a, b) => a[0] - b[0]).reduce((out, [s, e]) => {
    if (out.length && s - out.at(-1)[1] < STOP_SILENCE_MS) out.at(-1)[1] = Math.max(out.at(-1)[1], e);
    else out.push([s, e]);
    return out;
  }, []);

export function readClip(file) {
  if (file.endsWith('.wav')) return readWavPcm(file);
  const buf = readFileSync(file);
  return { pcm: new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 2))), rate: 48000 };
}

const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : null);
const dist = (xs) => ({ p50: pct(xs, 50), p90: pct(xs, 90), n: xs.length });

/** utterances: [{ start, end, lastWord?, mode, pauses: [[a, b] from start] }]; agentVoice: [[s, e]]. Run clock. */
export function realismOfTimeline(utterances, agentVoice) {
  const voice = joined(agentVoice);
  const heard = voice.length > 0;
  const onsets = voice.filter(([s, e]) => e - s > BACKCHANNEL_MAX_MS).map(([s]) => s);
  const blips = voice.filter(([s, e]) => e - s <= BACKCHANNEL_MAX_MS).map(([s]) => s);
  const startsIn = (a, b, ts = onsets) => ts.some((t) => t >= a && t < b);
  let [pauses, takeovers, pausedTurns, falseEnds, shortInPauses, unanswered] = [0, 0, 0, 0, 0, 0];
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
    // Windows end at the caller's last word, not the clip's end (a take's room tone).
    const last = Math.min(u.end, u.lastWord ?? u.end);
    const inPause = (t) => abs.some(([a, b]) => t >= a && t < b);
    if (abs.length) {
      pausedTurns++;
      // A short start after the caller resumed is a false start; a short one in a pause may be a clip.
      if (startsIn(abs[0][0], last) || blips.some((t) => t >= abs[0][0] && t < last && !inPause(t))) falseEnds++;
    }
    if (!heard || voice.some(([s, e]) => s < last && e > last)) continue;
    const next = voice.find(([s]) => s >= last)?.[0] ?? Infinity;
    unanswered += next - last > ANSWER_WINDOW_MS; // counted at the window: skipping slow turns can't help
    gaps.push(Math.min(next - last, ANSWER_WINDOW_MS));
  }
  return {
    pauses,
    takeovers,
    takeoverRate: heard ? rate(takeovers, pauses) : null,
    pausedTurns,
    falseEnds,
    falseEndRate: heard ? rate(falseEnds, pausedTurns) : null,
    gapMs: { ...dist(gaps), unanswered },
    bargeInStopMs: dist(stops),
    shortInPauses,
  };
}

/** The scripted utterances of a converse.mjs run; clipOf(turn) gives a turn's phrases from its clip. */
export function utterancesOf(run, clipOf) {
  const spoken = (run.results ?? []).filter((r) => /\.pcm$/.test(r.turn ?? ''));
  return (run.userSpeech ?? []).map(([start, end], k) => {
    const r = spoken[k] ?? {};
    const ph = r.mode || !r.turn ? [] : clipOf(r.turn);
    return { start, end, lastWord: ph.length ? start + ph.at(-1)[1] : end, mode: r.mode ?? '', pauses: pausesOf(ph) };
  });
}

export function realismOfRun(run) {
  const dir = run.meta?.audio;
  if (!dir) throw new Error('realism-metrics: run has no meta.audio (run.sh --realistic writes it)');
  const m = realismOfTimeline(
    utterancesOf(run, (turn) => {
      const { pcm, rate: hz } = readClip(join(dir, turn));
      return callerPhrases(pcm, hz, 0);
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
    .map((p) => {
      try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new Error(`realism-metrics: ${p}: ${e.message}`); }
    })
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
