/**
 * The recorded presence clips (PRESENCE_SOUND_ASSETS): the WAV reader takes
 * only the clip player's format, the shipped clips all load, and the picker
 * plays every clip before repeating and never one twice in a row.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createClipPicker,
  loadPresenceClips,
  pcmFromWav,
  presenceClipDirs,
  presenceClipPickers,
  presenceSoundAssetsEnabled,
} from '../presence-clips.js';

const BYTES_PER_SECOND = 24_000 * 2;

function wav(
  opts: {
    format?: number;
    channels?: number;
    rate?: number;
    bits?: number;
    extra?: Buffer;
    samples?: number;
  } = {}
): Buffer {
  const {
    format = 1,
    channels = 1,
    rate = 24_000,
    bits = 16,
    extra = Buffer.alloc(0),
    samples = 4,
  } = opts;
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(format, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE(rate * channels * (bits / 8), 16);
  fmt.writeUInt16LE(channels * (bits / 8), 20);
  fmt.writeUInt16LE(bits, 22);
  const data = Buffer.alloc(8 + samples * 2);
  data.write('data', 0, 'ascii');
  data.writeUInt32LE(samples * 2, 4);
  for (let i = 0; i < samples; i++) data.writeInt16LE(1000 + i, 8 + i * 2);
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, extra, data]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** An odd-sized LIST chunk, which ffmpeg writes before the data and must be padded past. */
function listChunk(): Buffer {
  const chunk = Buffer.alloc(8 + 5 + 1);
  chunk.write('LIST', 0, 'ascii');
  chunk.writeUInt32LE(5, 4);
  chunk.write('INFOx', 8, 'ascii');
  return chunk;
}

describe('pcmFromWav', () => {
  it('returns the samples of a 24 kHz mono 16-bit PCM WAV', () => {
    const pcm = pcmFromWav(wav());
    expect(pcm).not.toBeNull();
    expect(Array.from(new Int16Array(pcm!))).toEqual([1000, 1001, 1002, 1003]);
  });

  it('skips an odd-sized chunk before the data', () => {
    const pcm = pcmFromWav(wav({ extra: listChunk() }));
    expect(Array.from(new Int16Array(pcm!))).toEqual([1000, 1001, 1002, 1003]);
  });

  it.each([
    ['stereo', { channels: 2 }],
    ['44.1 kHz', { rate: 44_100 }],
    ['8-bit', { bits: 8 }],
    ['float', { format: 3 }],
  ])('rejects a %s WAV', (_name, opts) => {
    expect(pcmFromWav(wav(opts))).toBeNull();
  });

  it('rejects data that is not a WAV', () => {
    expect(pcmFromWav(Buffer.from('ID3 not a wav at all, an mp3 header'))).toBeNull();
    expect(pcmFromWav(Buffer.alloc(0))).toBeNull();
  });
});

describe('the shipped clips', () => {
  it('loads all nine whistles, each a short phrase', () => {
    const clips = loadPresenceClips(presenceClipDirs('whistles'));
    expect(clips).toHaveLength(9);
    for (const clip of clips) {
      expect(clip.byteLength / BYTES_PER_SECOND).toBeGreaterThan(1);
      expect(clip.byteLength / BYTES_PER_SECOND).toBeLessThanOrEqual(3.2);
    }
  });

  it('loads both snores, each about two breaths', () => {
    const clips = loadPresenceClips(presenceClipDirs('snores'));
    expect(clips).toHaveLength(2);
    for (const clip of clips) {
      expect(clip.byteLength / BYTES_PER_SECOND).toBeGreaterThan(6);
      expect(clip.byteLength / BYTES_PER_SECOND).toBeLessThanOrEqual(7.5);
    }
  });
});

describe('loadPresenceClips', () => {
  let dir = '';
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('skips a clip in the wrong format and keeps the rest', () => {
    dir = mkdtempSync(join(tmpdir(), 'presence-clips-'));
    writeFileSync(join(dir, 'a.wav'), wav());
    writeFileSync(join(dir, 'b.wav'), wav({ rate: 48_000 }));
    writeFileSync(join(dir, 'notes.txt'), 'not audio');
    expect(loadPresenceClips([dir])).toHaveLength(1);
  });

  it('falls through to the next folder, and to nothing', () => {
    dir = mkdtempSync(join(tmpdir(), 'presence-clips-'));
    writeFileSync(join(dir, 'a.wav'), wav());
    expect(loadPresenceClips([join(dir, 'missing'), dir])).toHaveLength(1);
    expect(loadPresenceClips([join(dir, 'missing')])).toEqual([]);
  });
});

describe('createClipPicker', () => {
  const clips = Array.from({ length: 9 }, () => new ArrayBuffer(2));

  /** A small deterministic generator, so the test is the same every run. */
  function seeded(seed: number): () => number {
    let s = seed;
    return () => (s = (s * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
  }

  it('plays every clip once before any repeats', () => {
    const picker = createClipPicker(clips, seeded(7));
    const first = Array.from({ length: 9 }, () => picker.next());
    expect(new Set(first).size).toBe(9);
  });

  it('never plays the same clip twice in a row, across many bags', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const picker = createClipPicker(clips, seeded(seed));
      let last: ArrayBuffer | null = null;
      for (let i = 0; i < 300; i++) {
        const next = picker.next();
        expect(next).not.toBe(last);
        last = next;
      }
    }
  });

  it('does not repeat at a bag boundary even when the shuffle would', () => {
    // Alternating draws flip each bag's order, so every fresh bag would start
    // with the clip the previous bag ended on
    const two = [new ArrayBuffer(2), new ArrayBuffer(2)];
    let flip = false;
    const picker = createClipPicker(two, () => {
      flip = !flip;
      return flip ? 0.99 : 0;
    });
    const order = Array.from({ length: 8 }, () => picker.next());
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });

  it('gives null with no clips, and the one clip when there is one', () => {
    expect(createClipPicker([]).next()).toBeNull();
    const one = new ArrayBuffer(2);
    expect(createClipPicker([one]).next()).toBe(one);
  });
});

describe('PRESENCE_SOUND_ASSETS', () => {
  it('is off unless set to on', () => {
    expect(presenceSoundAssetsEnabled({})).toBe(false);
    expect(presenceSoundAssetsEnabled({ PRESENCE_SOUND_ASSETS: 'true' })).toBe(false);
    expect(presenceSoundAssetsEnabled({ PRESENCE_SOUND_ASSETS: 'on' })).toBe(true);
    expect(presenceClipPickers({})).toBeNull();
  });

  it('with it on, gives a whistle and a snore picker over the shipped clips', () => {
    const pickers = presenceClipPickers({ PRESENCE_SOUND_ASSETS: 'on' });
    expect(pickers?.whistle.next()?.byteLength).toBeGreaterThan(0);
    expect(pickers!.snore.next()!.byteLength / BYTES_PER_SECOND).toBeGreaterThan(6);
  });
});
