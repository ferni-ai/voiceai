// Listener presence: when do Ferni's side-track clips ("mm-hmm", a laugh)
// land relative to the caller's pauses?
//
// People start a backchannel around the end of the speaker's phrase, at or
// just after the pause onset (Ward & Tsukahara 2000; 63% overlap the speaker
// a little). One that starts after the caller has resumed lands on top of
// their next phrase and reads as fake. In dev evals before the direct clip
// track (#695), mid-turn clips started a median 1.2 s after the pause onset
// and 82% after the caller resumed (n=208, duplex spike 2026-10-10).
//
// Times are the harness clock: what the listener in the room hears.
import { readFileSync } from 'node:fs';

/** 16-bit PCM samples and rate from a WAV file (finds the data chunk). */
export function readWavPcm(file) {
  const buf = readFileSync(file);
  const rate = buf.readUInt32LE(24);
  let at = 12;
  while (at + 8 <= buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'data') {
      const n = Math.floor(Math.min(size, buf.length - at - 8) / 2);
      return {
        pcm: new Int16Array(
          buf.buffer.slice(buf.byteOffset + at + 8, buf.byteOffset + at + 8 + n * 2)
        ),
        rate,
      };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}

/**
 * The caller's phrases (inter-pausal units) in run ms: 10 ms frames louder
 * than -45 dBFS, gaps under 150 ms merged, blips under 60 ms dropped.
 */
export function callerPhrases(pcm, rate, startT) {
  const frame = Math.round(rate / 100);
  const segs = [];
  let open = null;
  for (let i = 0; (i + 1) * frame <= pcm.length; i++) {
    let sum = 0;
    for (let j = i * frame; j < (i + 1) * frame; j++) sum += (pcm[j] / 32768) ** 2;
    const loud = 20 * Math.log10(Math.sqrt(sum / frame) + 1e-9) > -45;
    if (loud && open === null) open = i;
    if (!loud && open !== null) {
      segs.push([open, i]);
      open = null;
    }
  }
  if (open !== null) segs.push([open, Math.floor(pcm.length / frame)]);
  const merged = [];
  for (const s of segs) {
    if (merged.length && s[0] - merged[merged.length - 1][1] < 15)
      merged[merged.length - 1][1] = s[1];
    else merged.push([...s]);
  }
  return merged.filter(([a, b]) => b - a >= 6).map(([a, b]) => [startT + a * 10, startT + b * 10]);
}

/**
 * Mid-turn side-track clips of one run: clips that start inside a scripted
 * caller turn, at least 1.5 s in and before its last phrase ends (turn-end
 * clips are the opening sound, scored as perceivedDelayMs).
 */
export function midTurnClips(run, phrases) {
  const side = run.tracks.filter((t) => /background/i.test(t.name));
  const starts = side.flatMap((t) => (t.voice ?? []).map(([vs]) => vs));
  const out = [];
  for (const [s, e] of run.userSpeech) {
    const turn = phrases.filter(([a, b]) => b > s - 50 && a < e + 50);
    if (!turn.length) continue;
    const end = turn[turn.length - 1][1];
    for (const at of starts) {
      if (at < turn[0][0] + 1500 || at > end - 200) continue;
      const before = turn.filter(([, b]) => b <= at);
      if (!before.length) continue;
      const pauseAt = before[before.length - 1][1];
      const steppedOn =
        turn.some(([a]) => a > pauseAt && a <= at) || turn.some(([a, b]) => a <= at && at < b);
      out.push({ at, offsetMs: at - pauseAt, steppedOn });
    }
  }
  return out;
}

const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

/**
 * Pooled presence metrics. `clips` from midTurnClips over all runs,
 * `speechMs` the caller's phrase time. Targets: heard offset p50 <= 500 ms,
 * stepped-on rate <= 0.2, 4-9 per minute of the caller talking (Heinz 2003,
 * via human-baselines/RESEARCH.md).
 */
export function presenceMetrics(clips, speechMs) {
  return {
    bcHeardOffsetMs: {
      p50: pct(
        clips.map((c) => c.offsetMs),
        50
      ),
      p90: pct(
        clips.map((c) => c.offsetMs),
        90
      ),
      n: clips.length,
    },
    bcSteppedOnRate: clips.length
      ? Math.round((clips.filter((c) => c.steppedOn).length / clips.length) * 100) / 100
      : null,
    bcPerMinListening:
      speechMs > 0 ? Math.round((clips.length / (speechMs / 60000)) * 10) / 10 : null,
  };
}

/** Presence for a set of converse.mjs runs; runs without a mic recording are skipped. */
export function presenceOfRuns(runs, readWav = readWavPcm) {
  const clips = [];
  let speechMs = 0;
  for (const run of runs) {
    if (!run.mic?.file) continue;
    let wav;
    try {
      wav = readWav(run.mic.file);
    } catch {
      continue;
    }
    const phrases = callerPhrases(wav.pcm, wav.rate, run.mic.startT);
    speechMs += phrases.reduce((n, [a, b]) => n + b - a, 0);
    clips.push(...midTurnClips(run, phrases));
  }
  return presenceMetrics(clips, speechMs);
}
