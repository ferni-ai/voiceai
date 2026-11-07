/**
 * WEB_AUDIO_START_WATCH is the registry entry for the web call's "The sound didn't start"
 * notice (apps/web/src/config/audio-start-watch-flag.ts). The web app reads
 * VITE_WEB_AUDIO_START_WATCH, not the registry, so nothing else fails if this entry is
 * deleted or changed: the flags:expiry check only looks at entries a change adds or edits.
 * This pins it: off, owned by voice, an experiment with an expiry, tracked by #3514.
 */
import { describe, expect, it } from 'vitest';
import { FLAG_MANIFEST } from '../flag-manifest.js';

describe('WEB_AUDIO_START_WATCH registry entry', () => {
  it('is registered off, owned by voice, as an experiment tracked by #3514 with an expiry', () => {
    expect(FLAG_MANIFEST).toHaveProperty('WEB_AUDIO_START_WATCH');
    expect(FLAG_MANIFEST.WEB_AUDIO_START_WATCH).toMatchObject({
      default: 'off',
      owner: 'voice',
      kind: 'experiment',
      expires: '2027-02-04',
      issue: '#3514',
    });
  });
});
