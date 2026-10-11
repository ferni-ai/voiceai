import { describe, expect, it } from 'vitest';
import {
  callerPhrases,
  midTurnClips,
  presenceMetrics,
  presenceOfRuns,
  // @ts-expect-error plain .mjs script, no types
} from '../../../scripts/voice-eval/presence.mjs';

const RATE = 16000;

/** Caller audio from [startMs, endMs] spans of tone, silence elsewhere. */
function pcm(spans: Array<[number, number]>, totalMs: number): Int16Array {
  const out = new Int16Array((RATE * totalMs) / 1000);
  for (const [a, b] of spans)
    for (let i = (RATE * a) / 1000; i < (RATE * b) / 1000; i++)
      out[i] = Math.round(8000 * Math.sin(i / 5));
  return out;
}

// A caller turn from 1000 to 9000 ms: three phrases with 450 ms pauses.
const PHRASES: Array<[number, number]> = [
  [1000, 3500],
  [3950, 6500],
  [6950, 9000],
];
const run = (clipStarts: number[]) => ({
  userSpeech: [[1000, 9000]],
  tracks: [
    { name: 'voice-agent-1:roomio_audio', voice: [[9500, 11000]] },
    { name: 'voice-agent-1:background_audio', voice: clipStarts.map((s) => [s, s + 400]) },
  ],
  mic: { file: 'mic.wav', startT: 0 },
});

describe('voice-eval presence', () => {
  it('finds the caller phrases and the pauses between them', () => {
    expect(callerPhrases(pcm(PHRASES, 10000), RATE, 0)).toEqual(PHRASES);
    expect(callerPhrases(pcm([[0, 500]], 1000), RATE, 250)).toEqual([[250, 750]]);
  });

  it('keeps a phrase whole across a stop consonant (a gap under 150 ms)', () => {
    expect(
      callerPhrases(
        pcm(
          [
            [0, 400],
            [500, 900],
          ],
          1000
        ),
        RATE,
        0
      )
    ).toEqual([[0, 900]]);
  });

  it('a clip in the pause is on time; one after the caller resumes stepped on them', () => {
    const clips = midTurnClips(run([3600, 6500 + 900]), PHRASES);
    expect(clips).toEqual([
      { at: 3600, offsetMs: 100, steppedOn: false },
      { at: 7400, offsetMs: 900, steppedOn: true },
    ]);
  });

  it('leaves out clips at the turn end (the opening sound) and in the first 1.5 s', () => {
    expect(midTurnClips(run([1800, 9100, 9500]), PHRASES)).toEqual([]);
  });

  it('ignores the reply voice track', () => {
    const r = run([]);
    r.tracks[0]!.voice = [[3600, 4000]];
    expect(midTurnClips(r, PHRASES)).toEqual([]);
  });

  it('pools heard offset, stepped-on rate and rate per minute of the caller talking', () => {
    const m = presenceMetrics(
      [
        { at: 0, offsetMs: 100, steppedOn: false },
        { at: 0, offsetMs: 1200, steppedOn: true },
        { at: 0, offsetMs: 1300, steppedOn: true },
        { at: 0, offsetMs: 200, steppedOn: false },
      ],
      120_000
    );
    expect(m).toEqual({
      bcHeardOffsetMs: { p50: 1200, p90: 1300, n: 4 },
      bcSteppedOnRate: 0.5,
      bcPerMinListening: 2,
    });
    expect(presenceMetrics([], 0)).toEqual({
      bcHeardOffsetMs: { p50: null, p90: null, n: 0 },
      bcSteppedOnRate: null,
      bcPerMinListening: null,
    });
  });

  it('scores runs end to end from the mic recording, skipping runs without one', () => {
    const wav = { pcm: pcm(PHRASES, 10000), rate: RATE };
    const late = presenceOfRuns([run([4300]), { ...run([]), mic: undefined }], () => wav);
    expect(late.bcHeardOffsetMs.n).toBe(1);
    expect(late.bcSteppedOnRate).toBe(1);
    const onTime = presenceOfRuns([run([3550])], () => wav);
    expect(onTime.bcSteppedOnRate).toBe(0);
    expect(onTime.bcHeardOffsetMs.p50).toBe(50);
  });
});
