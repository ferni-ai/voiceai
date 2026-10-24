/**
 * Pins the voice id outreach voicemails send to Cartesia. The profile table is
 * built at import, so each case re-imports the module after setting the env.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return { file: () => ({ save: async () => {}, makePublic: async () => {} }) };
    }
  },
}));

const FERNI_DEFAULT = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';
const THIRD = '11111111-2222-4333-8444-555555555555';

async function sentVoiceId(personaId: string): Promise<string | undefined> {
  let id: string | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      id = JSON.parse(init.body).voice.id;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8), text: async () => '' };
    })
  );
  const mod = await import('../voice-synthesis.js');
  mod.initializeVoiceSynthesis({ cartesiaApiKey: 'k', gcsProjectId: 'p', gcsBucketName: 'b' });
  await mod.generateVoiceMessage({ text: 'hi there', personaId, userId: 'u1' });
  return id;
}

describe('outreach voice synthesis: voice id sent to Cartesia', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('FERNI_VOICE_ID', '');
    vi.stubEnv('JACK_B_VOICE_ID', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(['ferni', 'not-a-persona'])('%s sends fdeb5d75 when FERNI_VOICE_ID is unset', async (p) => {
    expect(await sentVoiceId(p)).toBe(FERNI_DEFAULT);
  });

  it.each(['ferni', 'not-a-persona'])('%s sends FERNI_VOICE_ID when set to a third id', async (p) => {
    vi.stubEnv('FERNI_VOICE_ID', THIRD);
    expect(await sentVoiceId(p)).toBe(THIRD);
  });

  it.each(['maya', 'peter', 'alex', 'jordan', 'nayan'])('%s ignores FERNI_VOICE_ID', async (p) => {
    const before = await sentVoiceId(p);
    vi.resetModules();
    vi.stubEnv('FERNI_VOICE_ID', THIRD);
    expect(await sentVoiceId(p)).toBe(before);
    expect(before).not.toBe(THIRD);
  });
});
