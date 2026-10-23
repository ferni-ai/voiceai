/**
 * The classification of prod-only env names stays consistent with the flag manifest:
 * a behaviour name is a manifest flag with a default and an owner, and no other class is.
 */
import { describe, expect, it } from 'vitest';
import { ENV_CLASSIFICATION } from '../env-classification.js';
import { ENV_READ_NAMES } from '../env-read-names.generated.js';
import { FLAG_KINDS, FLAG_MANIFEST, FLAG_OWNERS } from '../flag-manifest.js';

describe('env classification', () => {
  const entries = Object.entries(ENV_CLASSIFICATION);

  it('classes every persona voice id the code reads as config', () => {
    // The boot line prints a voice id only when it is classed config; an unclassed one shows as
    // <set>, and the secrets parity check can never compare it.
    const unclassed = [...new Set(ENV_READ_NAMES)].filter(
      (name) => name.endsWith('_VOICE_ID') && ENV_CLASSIFICATION[name] !== 'config'
    );
    expect(unclassed).toEqual([]);
  });

  it('lists every behaviour name in the flag manifest', () => {
    const missing = entries
      .filter(([name, cls]) => cls === 'behavior' && !(name in FLAG_MANIFEST))
      .map(([name]) => name);
    expect(missing, 'Add these to FLAG_MANIFEST with a default, owner and kind').toEqual([]);
  });

  it('keeps manifest flags out of the other classes', () => {
    const overlap = entries
      .filter(([name, cls]) => cls !== 'behavior' && name in FLAG_MANIFEST)
      .map(([name]) => name);
    expect(overlap).toEqual([]);
  });

  it('gives each behaviour flag a known owner and kind', () => {
    for (const [name, cls] of entries) {
      if (cls !== 'behavior') continue;
      const spec = FLAG_MANIFEST[name as keyof typeof FLAG_MANIFEST];
      expect(FLAG_OWNERS, name).toContain(spec.owner);
      expect(FLAG_KINDS, name).toContain(spec.kind);
    }
  });

  it('keeps secret names out of the printable settings', () => {
    // A secret-classed name must never be one the report prints by value.
    const printable = [
      'AGENT_NAME',
      'BUILD_SHA',
      'GEMINI_MODEL',
      'GOOGLE_CLOUD_PROJECT',
      'NODE_ENV',
      'PERSONA_ID',
      'PORT',
    ];
    for (const name of printable) {
      expect(ENV_CLASSIFICATION[name] ?? 'config', name).not.toBe('secret');
    }
  });
});
