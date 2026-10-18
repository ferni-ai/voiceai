/**
 * The classification of prod-only env names stays consistent with the flag manifest:
 * a behaviour name is a manifest flag with a default and an owner, and no other class is.
 */
import { describe, expect, it } from 'vitest';
import { ENV_CLASSIFICATION } from '../env-classification.js';
import { FLAG_KINDS, FLAG_MANIFEST, FLAG_OWNERS } from '../flag-manifest.js';

describe('env classification', () => {
  const entries = Object.entries(ENV_CLASSIFICATION);

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
