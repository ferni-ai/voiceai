import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { SONIC3_EMOTIONS, toSonicEmotion } from '../sonic-emotions.js';

// docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion, 2026-10-04
const DOCUMENTED = [
  'neutral',
  'happy',
  'excited',
  'enthusiastic',
  'elated',
  'euphoric',
  'triumphant',
  'amazed',
  'surprised',
  'flirtatious',
  'curious',
  'content',
  'peaceful',
  'serene',
  'calm',
  'grateful',
  'affectionate',
  'trust',
  'sympathetic',
  'anticipation',
  'mysterious',
  'angry',
  'mad',
  'outraged',
  'frustrated',
  'agitated',
  'threatened',
  'disgusted',
  'contempt',
  'envious',
  'sarcastic',
  'ironic',
  'sad',
  'dejected',
  'melancholic',
  'disappointed',
  'hurt',
  'guilty',
  'bored',
  'tired',
  'rejected',
  'nostalgic',
  'wistful',
  'apologetic',
  'hesitant',
  'insecure',
  'confused',
  'resigned',
  'anxious',
  'panicked',
  'alarmed',
  'scared',
  'proud',
  'confident',
  'distant',
  'skeptical',
  'contemplative',
  'determined',
];

describe('Sonic 3 emotions', () => {
  it('lists exactly the documented values', () => {
    expect([...SONIC3_EMOTIONS].sort()).toEqual([...DOCUMENTED].sort());
  });

  it('passes documented values through, case-insensitively', () => {
    for (const e of DOCUMENTED) expect(toSonicEmotion(e)).toBe(e);
    expect(toSonicEmotion('Trust')).toBe('trust');
  });

  it('maps names Sonic 3 does not know to the nearest one it does', () => {
    expect(toSonicEmotion('thoughtful')).toBe('contemplative');
    expect(toSonicEmotion('gentle')).toBe('calm');
    expect(toSonicEmotion('friendly')).toBe('happy');
    expect(toSonicEmotion('hopeful')).toBe('anticipation');
    expect(toSonicEmotion('empathetic')).toBe('sympathetic');
    expect(toSonicEmotion('warm')).toBe('affectionate');
    // Sonic 2 names
    expect(toSonicEmotion('happiness')).toBe('happy');
    expect(toSonicEmotion('positivity')).toBe('content');
    expect(toSonicEmotion('fear')).toBe('scared');
  });

  it('returns undefined for names with no sensible mapping', () => {
    expect(toSonicEmotion('purple')).toBeUndefined();
    expect(toSonicEmotion('')).toBeUndefined();
  });

  it('resolves every emotion value written anywhere in src', () => {
    const root = resolve(__dirname, '../..');
    const unresolved = new Set<string>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (name === '__tests__' || name === 'node_modules') continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|json|md)$/.test(name)) {
          for (const line of readFileSync(path, 'utf8').split('\n')) {
            if (/^\s*(\/\/|\/?\*)/.test(line)) continue; // comments describe tags, e.g. "sym" + "pathetic"
            // lowercase only: docs write value="X" as a placeholder
            for (const m of line.matchAll(/emotion value=["']([a-z_]+)["']/g)) {
              if (!toSonicEmotion(m[1])) unresolved.add(`${m[1]} (${path.slice(root.length + 1)})`);
            }
          }
        }
      }
    };
    walk(root);
    expect([...unresolved]).toEqual([]);
  });
});
