/**
 * Smoke tests for the live speech harness's pure helpers, on synthetic audio.
 * Run: pnpm vitest run scripts/audio-eval/__tests__/speech-e2e-lib.test.ts
 */
import { describe, expect, it } from 'vitest';

import {
  analyzeEnergy,
  annotations,
  chunkLikeLlm,
  encodeWav,
  expandAlternatives,
  intToWords,
  leadingEnergyMs,
  median,
  normalizeTranscript,
  seededRng,
  spelledOut,
  spokenStageDirections,
  wer,
  windowDb,
  yearToWords,
} from '../speech-e2e-lib.js';

const SR = 24000;

/** Concatenate segments of [kind, ms]: tone at -12 dBFS, quiet noise at -55 dBFS, or digital silence. */
function synth(segments: Array<['tone' | 'noise' | 'silence' | 'breath', number]>): Int16Array {
  const parts: number[] = [];
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
  for (const [kind, ms] of segments) {
    const n = Math.round((SR * ms) / 1000);
    for (let i = 0; i < n; i++) {
      if (kind === 'tone')
        parts.push(Math.round(Math.sin((2 * Math.PI * 220 * i) / SR) * 32767 * 0.35));
      else if (kind === 'breath')
        parts.push(Math.round(rnd() * 32767 * 0.03)); // ~ -35 dBFS hiss
      else if (kind === 'noise')
        parts.push(Math.round(rnd() * 32767 * 0.002)); // ~ -59 dBFS
      else parts.push(0);
    }
  }
  return Int16Array.from(parts);
}

describe('energy analysis', () => {
  it('measures window level in dBFS', () => {
    const tone = synth([['tone', 100]]);
    expect(windowDb(tone, 0, tone.length)).toBeCloseTo(-12.1, 0);
    expect(windowDb(new Int16Array(100), 0, 100)).toBe(-Infinity);
  });

  it('finds internal silences above the threshold and ignores edges and short gaps', () => {
    const pcm = synth([
      ['silence', 400], // leading: not internal
      ['tone', 500],
      ['noise', 300], // short gap
      ['tone', 500],
      ['noise', 900], // long internal silence
      ['tone', 500],
      ['silence', 1500], // trailing: not internal
    ]);
    const a = analyzeEnergy(pcm, SR, { minSilenceMs: 700 });
    expect(a.durationMs).toBe(4600);
    expect(a.firstEnergyMs).toBe(400);
    expect(a.lastEnergyMs).toBe(3100);
    expect(a.internalSilences).toEqual([{ startMs: 1700, durationMs: 900 }]);
    expect(a.longestInternalSilenceMs).toBe(900);
  });

  it('reports no sound and no silences for silent audio', () => {
    const a = analyzeEnergy(new Int16Array(SR), SR);
    expect(a.firstEnergyMs).toBeNull();
    expect(a.internalSilences).toEqual([]);
  });

  it('measures sound before the first word (an opening breath), not plain silence', () => {
    const withBreath = analyzeEnergy(
      synth([
        ['breath', 400],
        ['silence', 100],
        ['tone', 600],
      ]),
      SR
    );
    expect(leadingEnergyMs(withBreath, 500)).toBe(350); // 500 - 150 ms margin, all breath
    const plain = analyzeEnergy(
      synth([
        ['silence', 500],
        ['tone', 600],
      ]),
      SR
    );
    expect(leadingEnergyMs(plain, 500)).toBe(0);
  });

  it('encodes a valid mono 16-bit WAV', () => {
    const pcm = Int16Array.from([0, 1000, -1000, 32767]);
    const wav = encodeWav(pcm, SR);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(SR);
    expect(wav.readUInt32LE(40)).toBe(8);
    expect(wav.readInt16LE(44 + 2 * 2)).toBe(-1000);
    expect(wav.length).toBe(52);
  });
});

describe('transcript normalization', () => {
  it('says numbers the way a voice does', () => {
    expect(intToWords(0)).toBe('zero');
    expect(intToWords(401)).toBe('four hundred one');
    expect(intToWords(19_999)).toBe('nineteen thousand nine hundred ninety nine');
    expect(yearToWords(1990)).toBe('nineteen ninety');
    expect(yearToWords(1905)).toBe('nineteen oh five');
    expect(yearToWords(2005)).toBe('two thousand five');
  });

  it('normalizes money, decades, times, negatives, codes and letter runs consistently', () => {
    const n = (s: string): string => normalizeTranscript(s).join(' ');
    expect(n('$19.99')).toBe('nineteen dollars and ninety nine cents');
    expect(n('the 1990s')).toBe('the nineteen nineties');
    expect(n('at 7pm')).toBe(n('at seven p.m.'));
    expect(n('7:00 PM')).toBe('seven pm');
    expect(n('-5°')).toBe('minus five degrees');
    expect(n('AB12CD')).toBe(n('A B one two C D'));
    expect(n('401(k)')).toBe(n('four oh one k'));
    expect(n('F.D.I.C.')).toBe('fdic');
    expect(n("It's (sighs) okay, um, ok")).toBe('its okay okay');
  });
});

describe('WER', () => {
  it('is 0 for a matching reading and counts word errors', () => {
    expect(wer('that is really good', 'That is REALLY good.').wer).toBe(0);
    const r = wer('that is really good', 'that is good');
    expect(r.errors).toBe(1);
    expect(r.wer).toBeCloseTo(0.25);
  });

  it('takes the best acceptable reading', () => {
    expect(expandAlternatives('a {b|c} d {e|}')).toEqual([
      'a b d e',
      'a b d ',
      'a c d e',
      'a c d ',
    ]);
    expect(
      wer(
        'its {nineteen ninety nine|nineteen dollars and ninety nine cents} a month',
        "It's $19.99 a month"
      ).wer
    ).toBe(0);
    expect(
      wer(
        'its {nineteen ninety nine|nineteen dollars and ninety nine cents} a month',
        'its nineteen ninety nine a month'
      ).wer
    ).toBe(0);
  });

  it('flags spoken stage directions but not sound annotations', () => {
    expect(spokenStageDirections('Sighs. I am so sorry.')).toEqual(['sighs']);
    expect(spokenStageDirections('(sighs) I am so sorry. [laughter]')).toEqual([]);
    expect(annotations('(sighs) I am so sorry. [laughter]')).toEqual(['sighs', 'laughter']);
    expect(spokenStageDirections('That asterisk smiles at you')).toEqual(['asterisk', 'smiles']);
  });

  it('detects a word spelled letter by letter', () => {
    expect(spelledOut('That is R E A L L Y good', 'really')).toBe(true);
    expect(spelledOut('That is R-E-A-L-L-Y good', 'really')).toBe(true);
    expect(spelledOut('That is really good', 'really')).toBe(false);
  });
});

describe('LLM-like chunking', () => {
  it('reassembles exactly, keeps tokens short, and is deterministic per seed', () => {
    const text = '**Bold** idea: - one - two. Your code is <spell>AB12CD</spell>.';
    const a = chunkLikeLlm(text, seededRng(42));
    expect(a.map((c) => c.text).join('')).toBe(text);
    expect(a.every((c) => c.text.trim().length <= 6)).toBe(true);
    expect(a.every((c) => c.gapMs >= 12 && c.gapMs <= 150)).toBe(true);
    expect(chunkLikeLlm(text, seededRng(42))).toEqual(a);
  });

  it('median ignores non-finite values', () => {
    expect(median([3, 1, NaN, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([NaN])).toBeNull();
  });
});
