import { describe, expect, it } from 'vitest';
import {
  LEAD_KEEP_MS,
  MAX_TRIM_MS,
  leadSilenceTrimEnabled,
  trimLeadingSilence,
} from '../lead-silence.js';

const RATE = 24000;
const ms = (n: number) => Math.round((n * RATE) / 1000);

/** `silentMs` of near-silence (|s| < 32), then `voicedMs` of a loud tone. */
function pcm(silentMs: number, voicedMs: number, noise = 5): Int16Array {
  const a = new Int16Array(ms(silentMs) + ms(voicedMs));
  for (let i = 0; i < ms(silentMs); i++) a[i] = i % 2 ? noise : -noise;
  for (let i = ms(silentMs); i < a.length; i++) a[i] = Math.round(8000 * Math.sin(i / 3));
  return a;
}

function chunks(a: Int16Array, sizeMs: number): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (let i = 0; i < a.length; i += ms(sizeMs)) out.push(a.slice(i, i + ms(sizeMs)).buffer);
  return out;
}

async function run(input: ArrayBuffer[]) {
  let trimmed: number | undefined;
  async function* src() {
    for (const c of input) yield c;
  }
  const out: Int16Array[] = [];
  for await (const c of trimLeadingSilence(src(), RATE, (m) => (trimmed = m)))
    out.push(new Int16Array(c));
  const all = new Int16Array(out.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of out) (all.set(c, o), (o += c.length));
  return { all, trimmed };
}

const firstLoud = (a: Int16Array) => a.findIndex((s) => Math.abs(s) >= 32);

describe('trimLeadingSilence', () => {
  it('is off unless CASCADE_TRIM_LEAD_SILENCE=on', () => {
    expect(leadSilenceTrimEnabled({})).toBe(false);
    expect(leadSilenceTrimEnabled({ CASCADE_TRIM_LEAD_SILENCE: 'on' })).toBe(true);
  });

  it("drops Sonic's ~110 ms lead-in, keeping 10 ms before the first sound", async () => {
    const input = pcm(110, 200);
    expect(firstLoud(input)).toBe(ms(110));
    const { all, trimmed } = await run(chunks(input, 154));
    expect(firstLoud(all)).toBe(ms(LEAD_KEEP_MS));
    expect(trimmed).toBe(100);
    expect(all.length).toBe(input.length - ms(100));
  });

  it('finds the onset across chunk boundaries and keeps the quiet just before it', async () => {
    // 55 ms chunks: the sound starts exactly on a chunk boundary, so the kept
    // quiet has to come from the chunk before.
    const input = pcm(110, 100);
    const { all, trimmed } = await run(chunks(input, 55));
    expect(firstLoud(all)).toBe(ms(LEAD_KEEP_MS));
    expect(trimmed).toBe(100);
    expect(all.subarray(ms(LEAD_KEEP_MS))).toEqual(input.subarray(ms(110)));
  });

  it('keeps a long quiet start once the cap is reached', async () => {
    const input = pcm(MAX_TRIM_MS + 200, 100);
    const { all } = await run(chunks(input, 50));
    expect(firstLoud(all)).toBeGreaterThan(ms(150));
    expect(all.length).toBeGreaterThan(input.length - ms(MAX_TRIM_MS) - ms(60));
  });

  it('passes speech that starts at once untouched', async () => {
    const input = pcm(0, 100);
    const { all, trimmed } = await run(chunks(input, 154));
    expect(all).toEqual(input);
    expect(trimmed).toBe(0);
  });
});
