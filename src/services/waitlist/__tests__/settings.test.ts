/**
 * When the next wave is, and settings that survive a typo in Firestore.
 */
import { describe, expect, it } from 'vitest';
import { nextWaveAt, readSettings } from '../settings.js';

describe('nextWaveAt', () => {
  it('is the next Monday or Thursday at 17:00 UTC still ahead', () => {
    const at = (iso: string) => nextWaveAt('Mon,Thu', new Date(iso)).toISOString();
    expect(at('2026-10-17T12:00:00Z')).toBe('2026-10-19T17:00:00.000Z'); // Saturday → Monday
    expect(at('2026-10-19T16:59:00Z')).toBe('2026-10-19T17:00:00.000Z'); // Monday, before
    expect(at('2026-10-19T17:00:00Z')).toBe('2026-10-22T17:00:00.000Z'); // Monday, at → Thursday
  });

  it('falls back to the default settings for missing or nonsense values', () => {
    expect(readSettings({ waveSize: -3, cadence: 'someday', paused: 'yes' })).toEqual({
      waveSize: 100,
      cadence: 'Mon,Thu',
      paused: false,
      costCeilingUsd: 50,
      errorRateCeiling: 0.05,
    });
    expect(readSettings({ waveSize: 40, cadence: 'Tue' }).waveSize).toBe(40);
  });
});
