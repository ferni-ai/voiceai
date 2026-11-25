/**
 * NAYAN_PLAIN_VOICE (#1433): the plain arrival openers are pre-rendered at boot whatever the
 * flag, so the first words after a handoff stay instant when it is on. Additive: every opener
 * that was pre-rendered before is still pre-rendered. Cartesia is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ARRIVING_OPENERS,
  PLAIN_ARRIVING_OPENERS,
} from '../../../services/team-engagement/banter.js';
import {
  clearConversationalCache,
  getCachedAudioForPersona,
  prewarmConversationalAudio,
} from '../conversational-audio-cache.js';

const NAYAN = 'nayan-patel';

beforeEach(() => {
  clearConversationalCache();
  vi.stubEnv('CARTESIA_API_KEY', 'test-key');
  vi.stubEnv('SKIP_CONVERSATIONAL_PREWARM', 'false');
  vi.stubEnv('NAYAN_PLAIN_VOICE', 'off');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4800) }))
  );
});

afterEach(() => {
  clearConversationalCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('prewarm of the arrival openers', () => {
  it('pre-renders Nayan’s plain openers with the flag off', async () => {
    await prewarmConversationalAudio();
    expect(PLAIN_ARRIVING_OPENERS[NAYAN]).toHaveLength(3);
    for (const line of PLAIN_ARRIVING_OPENERS[NAYAN]) {
      expect(getCachedAudioForPersona(line, NAYAN), line).not.toBeNull();
    }
  });

  it('still pre-renders Nayan’s openers from before (additive)', async () => {
    await prewarmConversationalAudio();
    expect(ARRIVING_OPENERS[NAYAN]).toHaveLength(3);
    for (const line of ARRIVING_OPENERS[NAYAN]) {
      expect(getCachedAudioForPersona(line, NAYAN), line).not.toBeNull();
    }
  });
});
