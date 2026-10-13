/**
 * Voice journal audio is uploaded private, never public.
 *
 * Audit 2026-10-13 (legacy-e2e journal.md, section 6): uploadVoiceJournalEntry
 * passed makePublic=true, so the dormant POST /api/custom-agents/:id/journal/entry
 * route would have given a private journal recording a public URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket(): { file: () => { save: typeof save } } {
      return { file: () => ({ save }) };
    }
  },
}));

async function loadService(): Promise<typeof import('../gcs-storage-service.js')> {
  vi.resetModules();
  return import('../gcs-storage-service.js');
}

beforeEach(() => {
  save.mockClear();
  vi.stubEnv('GCS_CUSTOM_AGENT_BUCKET', 'test-bucket');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('uploadVoiceJournalEntry', () => {
  it('saves the recording private', async () => {
    const { uploadVoiceJournalEntry } = await loadService();

    const result = await uploadVoiceJournalEntry(Buffer.from('audio'), 'uid1', 'twin1', 'e1');

    expect(result).not.toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
    const options = save.mock.calls[0]?.[1] as { public: boolean };
    expect(options.public).toBe(false);
  });
});
