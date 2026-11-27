import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIO_DIMENSIONS,
  audioPrompt,
  cleanScores,
  mergeVerdict,
  stereoOf,
} from '../audio-judge.mjs';
import { mixParts, wavBytes } from '../mix-tracks.mjs';

describe('mixParts', () => {
  const parts = [
    { pcm: Int16Array.from([100, 100]), startT: 0, gain: 1, side: 'caller' },
    { pcm: Int16Array.from([50, 50]), startT: 0, gain: 1, side: 'agent' },
  ];

  it('puts the caller left and the agent right in stereo', () => {
    const { pcm, channels } = mixParts(parts, { stereo: true });
    expect(channels).toBe(2);
    expect([...pcm]).toEqual([100, 50, 100, 50]);
  });

  it('sums both in mono, placed by start time', () => {
    const late = [parts[0], { ...parts[1], startT: (1000 / 24000) * 1 }];
    expect([...mixParts(parts).pcm]).toEqual([150, 150]);
    expect([...mixParts(late).pcm]).toEqual([100, 150, 50]);
  });
});

describe('cleanScores and mergeVerdict', () => {
  it('keeps only 1-5 numbers or null, for the listener dimensions', () => {
    expect(
      cleanScores({
        voiceHuman: 4,
        voiceTiming: 9,
        voiceProsody: '3',
        voiceReactions: null,
        conduct: 5,
      })
    ).toEqual({
      voiceHuman: 4,
      voiceReactions: null,
    });
  });

  it('adds the listener scores beside the transcript scores', () => {
    const merged = mergeVerdict(
      { scores: { conduct: 2 }, humanLikelihood: 0.3 },
      { scores: { voiceHuman: 3 }, evidence: { voiceHuman: '00:12 flat reading' } },
      'gemini-x'
    );
    expect(merged.scores).toEqual({ conduct: 2, voiceHuman: 3 });
    expect(merged.humanLikelihood).toBe(0.3);
    expect(merged.audio).toEqual({
      model: 'gemini-x',
      evidence: { voiceHuman: '00:12 flat reading' },
      worstMoment: null,
    });
  });
});

describe('audioPrompt', () => {
  it('names every dimension and tells the listener to ignore AI disclosure', () => {
    const p = audioPrompt();
    for (const k of Object.keys(AUDIO_DIMENSIONS)) expect(p).toContain(`"${k}"`);
    expect(p).toMatch(/RIGHT-channel/);
    expect(p).toMatch(/never counts for or against/);
  });
});

describe('stereoOf', () => {
  it('builds a stereo WAV from the run files, and null without an agent track', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audio-judge-'));
    const mic = join(dir, 'r.mic.wav');
    const agent = join(dir, 'r.agent.wav');
    writeFileSync(mic, wavBytes(Int16Array.from([1, 2, 3, 4]), { rate: 24000 }));
    writeFileSync(agent, wavBytes(Int16Array.from([5, 6]), { rate: 24000 }));
    const wav = stereoOf({ mic: { file: mic, startT: 0 }, tracks: [{ file: agent, startT: 0 }] });
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(stereoOf({ mic: { file: mic, startT: 0 }, tracks: [] })).toBeNull();
    expect(stereoOf({})).toBeNull();
  });
});
