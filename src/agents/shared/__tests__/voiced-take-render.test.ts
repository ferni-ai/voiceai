/**
 * Seth's kept takes render with the tags the voice honors (instant clone: all;
 * Pro clone: volume only), on the approved model and API version, trimmed and
 * loudness-matched; warmPersonaReactions renders them only with VOICED_PRESENCE=on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderVoicedTake,
  transcriptForVoice,
  trimAndNormalize,
  voicedPresenceEnabled,
  voicedTakeTexts,
} from '../voiced-take-render.js';
import { clearConversationalCache, warmPersonaReactions } from '../conversational-audio-cache.js';

const INSTANT = 'fdeb5d75-0000-4000-8000-000000000000';
const PRO = 'ebaf7477-b6ae-417e-be54-19e6176777ea'; // Lester Nare (Pro) V3

/** `lead` and `tail` samples of silence around `body` samples of a tone at `amp`. */
function clip(lead: number, body: number, tail: number, amp: number): ArrayBuffer {
  const s = new Int16Array(lead + body + tail);
  for (let i = 0; i < body; i++) s[lead + i] = Math.round(amp * Math.sin(i / 3));
  return s.buffer;
}
const rms = (pcm: ArrayBuffer) => {
  const s = new Int16Array(pcm);
  let sum = 0;
  let n = 0;
  for (const v of s) {
    if (Math.abs(v) <= 104) continue;
    sum += v * v;
    n++;
  }
  return Math.sqrt(sum / n);
};

describe('VOICED_PRESENCE flag', () => {
  it('is off unless switched on', () => {
    expect(voicedPresenceEnabled({})).toBe(false);
    expect(voicedPresenceEnabled({ VOICED_PRESENCE: 'off' })).toBe(false);
    expect(voicedPresenceEnabled({ VOICED_PRESENCE: 'on' })).toBe(true);
  });
});

describe('transcriptForVoice', () => {
  const take = '<emotion value="calm"/><speed ratio="0.8"/><volume ratio="0.6"/>Mmm, ahh.';

  it('passes emotion, speed and volume to an instant clone', () => {
    expect(transcriptForVoice(take, INSTANT)).toBe(take);
  });

  it('strips emotion and speed for a Pro clone, keeps volume (measured honored)', () => {
    expect(transcriptForVoice(take, PRO)).toBe('<volume ratio="0.6"/>Mmm, ahh.');
  });

  it('strips tags no voice is known to honor, and keeps [laughter]', () => {
    expect(transcriptForVoice('<break time="1s"/>Ha, [laughter]', INSTANT)).toBe('Ha, [laughter]');
  });
});

describe('trimAndNormalize', () => {
  it('trims leading and trailing silence to a 10 ms pad', () => {
    const out = new Int16Array(trimAndNormalize(clip(12000, 4800, 9000, 8000))!);
    expect(out.length).toBeLessThanOrEqual(4800 + 2 * 240);
    expect(out.length).toBeGreaterThan(4800);
  });

  it('treats -50 dBFS hiss as silence', () => {
    const s = new Int16Array(clip(6000, 2400, 6000, 8000));
    for (let i = 0; i < 6000; i++) s[i] = i % 2 ? 90 : -90; // ~-51 dBFS
    expect(new Int16Array(trimAndNormalize(s.buffer)!).length).toBeLessThan(2400 + 2 * 240 + 1);
  });

  it('brings a quiet and a loud take to the same loudness, under the peak ceiling', () => {
    const quiet = trimAndNormalize(clip(0, 4800, 0, 1500))!;
    const loud = trimAndNormalize(clip(0, 4800, 0, 20000))!;
    expect(Math.abs(rms(quiet) - rms(loud))).toBeLessThan(rms(loud) * 0.05);
    expect(rms(loud)).toBeGreaterThan(2900);
    expect(Math.max(...new Int16Array(loud).map(Math.abs))).toBeLessThanOrEqual(32767 * 0.89 + 1);
  });

  it('returns null for a silent render', () => {
    expect(trimAndNormalize(new Int16Array(4800).buffer)).toBeNull();
  });
});

describe('renderVoicedTake', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(clip(2400, 2400, 2400, 6000)));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('CARTESIA_API_KEY', 'test-key');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const sent = (i = 0) => {
    const [, init] = fetchMock.mock.calls[i] as [string, RequestInit];
    return {
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    };
  };

  it('asks for the approved model and API version at 24 kHz, tags intact for an instant clone', async () => {
    const pcm = await renderVoicedTake('<emotion value="excited"/>Ah!', INSTANT);
    const { headers, body } = sent();
    expect(headers['Cartesia-Version']).toBe('2025-04-16');
    expect(body.model_id).toBe('sonic-3.6-2026-08-27');
    expect(body.output_format.sample_rate).toBe(24000);
    expect(body.transcript).toBe('<emotion value="excited"/>Ah!');
    expect(new Int16Array(pcm!).length).toBeLessThan(2400 + 2 * 240 + 1); // trimmed
  });

  it('strips emotion for a Pro clone', async () => {
    await renderVoicedTake('<emotion value="excited"/>Ah!', PRO);
    expect(sent().body.transcript).toBe('Ah!');
  });
});

describe('warmPersonaReactions', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    clearConversationalCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(clip(100, 2400, 100, 6000)));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('CARTESIA_API_KEY', 'test-key');
    vi.stubEnv('FERNI_VOICE_ID', INSTANT);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const transcripts = () =>
    fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).transcript
    );

  it('off: renders only the reaction clips, as before', async () => {
    await warmPersonaReactions('ferni');
    expect(transcripts()).not.toContain('Hmmm.');
    expect(transcripts().some((t: string) => t.includes('<'))).toBe(false);
  });

  it('on: renders every kept take in the persona voice, with its tags, in the same run', async () => {
    vi.stubEnv('VOICED_PRESENCE', 'on');
    await warmPersonaReactions('ferni');
    const sentTexts = transcripts();
    expect(sentTexts).toContain('<speed ratio="0.8"/><volume ratio="0.6"/>Hmmmm.');
    expect(sentTexts).toContain('<emotion value="calm"/><speed ratio="0.7"/>Aaaahhh, mmm.');
    // "[laughter]" is already a reaction clip: rendered once, not twice.
    expect(sentTexts.filter((t: string) => t === '[laughter]')).toHaveLength(1);
    for (const take of voicedTakeTexts()) expect(sentTexts).toContain(take);
  });
});
