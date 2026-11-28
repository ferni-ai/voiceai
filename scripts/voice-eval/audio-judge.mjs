#!/usr/bin/env node
// A blind listener for recorded calls: how Ferni SOUNDS, which the transcript judge (judge.mjs)
// can't hear. Hearing a voice changes how human and thoughtful people judge a speaker
// (Schroeder and Epley 2015; Schroeder, Kardas and Epley 2017), and humanLikelihood is defined as
// what a blind listener would think, yet the nightly judge reads words only (#4513).
//
// usage: node scripts/voice-eval/audio-judge.mjs <run.json>...
//
// Each call is mixed to stereo (mix-tracks.mjs: the caller left, the agent right), sent to Gemini
// with audio in, and scored 1-5 on AUDIO_DIMENSIONS against the same anchor as judge.mjs (3 a good
// friend on the phone, 4 better than most, 5 better than any). The scores are merged into the run's
// <run>.judge.json `scores` (and the evidence under `audio`), so the nightly bar's "Judge dimension
// mean" rows pick them up with no scorecard change. Run it after judge.mjs, which rewrites that
// file. A run with no judge verdict yet, or no recording, is skipped and says so.
//
// Env: JUDGE_MODEL (default pro, as the nightly's judge), GCP_PROJECT (default: gcloud config).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { judgeModel } from '../lib/judge-model.mjs';
import { askGemini, verdictFile } from './judge.mjs';
import { MIX_RATE, mixParts, partsOf, wavBytes } from './mix-tracks.mjs';

/** What the listener scores. Every one is about the sound, never the words. */
export const AUDIO_DIMENSIONS = {
  voiceHuman:
    'How likely a listener who hears this call cold takes the RIGHT-channel speaker for a person, from how it sounds. Ignore anything said about being an AI or a person: that is honest and legally required, and never counts for or against.',
  voiceTiming:
    'Turn timing like a person on the phone: answers neither too slow nor too early, never talks over the caller, stops promptly when the caller cuts in, and leaves room after a question.',
  voiceProsody:
    'Tone, pace and emphasis fit what is being said and how the caller sounds: softer and slower for hard news, brighter for good news, natural stress on the words that matter; never flat, sing-song or read aloud.',
  voiceReactions:
    "Non-speech sounds (laughs, mm-hms, hums, sighs, a quick 'oh') sound spontaneous and land at the right moment, not canned, repeated or mistimed. Use null if there were none.",
};

const ANCHOR =
  'Score each 1-5 against a person, not against other voice assistants: 1 clearly fails, 2 below a typical person, 3 a good friend on the phone, 4 better than most friends would manage, 5 better than any friend could be.';

/** The listener's instructions. */
export function audioPrompt(dims = AUDIO_DIMENSIONS) {
  const lines = Object.entries(dims).map(([k, v]) => `- ${k}: ${v}`);
  return `You are listening to a recorded phone call between two speakers. The LEFT channel is the caller. Judge only the RIGHT-channel speaker, from how they sound.

${ANCHOR}

Dimensions:
${lines.join('\n')}

Reply with JSON only, no prose:
{"scores": {${Object.keys(dims)
    .map((k) => `"${k}": <1-5 or null>`)
    .join(', ')}},
 "evidence": {"<dimension>": "<mm:ss and what you heard that decided the score>"},
 "worstMoment": {"at": "<mm:ss>", "why": "<what a person would have done instead>"}}`;
}

/** Only 1-5 numbers (or null where allowed) survive; anything else is dropped. */
export function cleanScores(scores, dims = AUDIO_DIMENSIONS) {
  const out = {};
  for (const k of Object.keys(dims)) {
    const v = scores?.[k];
    if (typeof v === 'number' && v >= 1 && v <= 5) out[k] = v;
    else if (v === null) out[k] = null;
  }
  return out;
}

/** The transcript judge's verdict with the listener's scores merged in (theirs win on a clash). */
export function mergeVerdict(verdict, listened, model) {
  return {
    ...verdict,
    scores: { ...(verdict.scores ?? {}), ...cleanScores(listened.scores) },
    audio: { model, evidence: listened.evidence ?? {}, worstMoment: listened.worstMoment ?? null },
  };
}

/**
 * What the listener is sent: 16 kHz stereo, the first LISTEN_SECONDS at most. Vertex caps an
 * inline request near 20 MB, and base64 of 24 kHz stereo is about 128 KB a second, so a call
 * past two and a half minutes would fail; 180 s at 16 kHz is about 15 MB.
 */
export const LISTEN_RATE = 16000;
export const LISTEN_SECONDS = 180;

/** Interleaved PCM resampled by linear interpolation, cut to maxFrames frames. */
export function resample(pcm, channels, from, to, maxFrames = Infinity) {
  const inFrames = Math.floor(pcm.length / channels);
  const frames = Math.min(Math.floor((inFrames * to) / from), maxFrames);
  const out = new Int16Array(frames * channels);
  for (let i = 0; i < frames; i++) {
    const x = (i * from) / to;
    const j = Math.floor(x);
    const k = Math.min(j + 1, inFrames - 1);
    const f = x - j;
    for (let c = 0; c < channels; c++) {
      out[i * channels + c] = Math.round(
        pcm[j * channels + c] * (1 - f) + pcm[k * channels + c] * f
      );
    }
  }
  return out;
}

/** { wav, seconds, clipped } for a run's recording (caller left, agent right), or null. */
export function stereoOf(run) {
  if (!run?.mic?.file || !existsSync(run.mic.file)) return null;
  const parts = partsOf({
    ...run,
    tracks: (run.tracks ?? []).filter((t) => t.file && existsSync(t.file)),
  });
  if (!parts.some((p) => p.side === 'agent')) return null;
  const { pcm, channels, seconds } = mixParts(parts, { stereo: true });
  const out = resample(pcm, channels, MIX_RATE, LISTEN_RATE, LISTEN_SECONDS * LISTEN_RATE);
  return {
    wav: wavBytes(out, { channels, rate: LISTEN_RATE }),
    seconds,
    clipped: seconds > LISTEN_SECONDS,
  };
}

async function judgeOne(file, ctx) {
  const vfile = verdictFile(file, 'gemini');
  if (!existsSync(vfile))
    return `${file}: skipped, no transcript verdict yet (run judge.mjs first)`;
  const heard = stereoOf(JSON.parse(readFileSync(file, 'utf8')));
  if (!heard) return `${file}: skipped, no recording`;
  const listened = await askGemini(
    [
      { inlineData: { mimeType: 'audio/wav', data: heard.wav.toString('base64') } },
      { text: audioPrompt() },
    ],
    ctx
  );
  const merged = mergeVerdict(JSON.parse(readFileSync(vfile, 'utf8')), listened, ctx.model);
  // How much of the call the listener heard (a long call is cut at LISTEN_SECONDS).
  merged.audio.heard = { seconds: Math.min(heard.seconds, LISTEN_SECONDS), of: heard.seconds };
  writeFileSync(vfile, `${JSON.stringify(merged, null, 2)}\n`);
  return `${file}: ${JSON.stringify(cleanScores(listened.scores))}`;
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    process.stderr.write('usage: audio-judge.mjs <run.json>...\n');
    process.exit(2);
  }
  const project =
    process.env.GCP_PROJECT ??
    execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8' }).trim();
  const ctx = { model: judgeModel(process.env, 'pro'), project };
  let failed = 0;
  for (const f of files) {
    try {
      process.stdout.write(`${await judgeOne(f, ctx)}\n`);
    } catch (e) {
      failed++;
      process.stderr.write(`${f}: audio judge failed: ${e instanceof Error ? e.message : e}\n`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
