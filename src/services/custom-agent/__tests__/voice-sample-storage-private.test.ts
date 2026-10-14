/**
 * Voice-clone samples are raw recordings of a person, so they are never written
 * public-read.
 *
 * The upload route used to write each sample twice, and both copies were saved
 * with `public: true` and a 1-day public cache, at guessable
 * storage.googleapis.com URLs, with no cleanup. Now both the helper and
 * processVoiceUpload write privately (the route's single write is pinned in
 * api/custom-agent/__tests__/voice-upload-private.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { save } = vi.hoisted(() => {
  process.env.GCS_CUSTOM_AGENT_BUCKET = 'test-custom-agents';
  return { save: vi.fn(async (_buffer: Buffer, _options: Record<string, unknown>) => undefined) };
});
vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return { file: () => ({ save }) };
    }
  },
}));

const { uploadAudioToGcs } = await import('../gcs-storage-service.js');
const { processVoiceUpload } = await import('../voice-clone-service.js');

type SaveOptions = { public?: unknown; predefinedAcl?: unknown; metadata?: { cacheControl?: string } };

function expectPrivate(options: SaveOptions): void {
  expect(options.public).not.toBe(true);
  expect(options.predefinedAcl).toBeUndefined();
  expect(options.metadata?.cacheControl).not.toMatch(/public/);
}

beforeEach(() => {
  save.mockClear();
});

describe('the upload helper', () => {
  it('writes a voice-clone sample privately by default and returns no public URL', async () => {
    const result = await uploadAudioToGcs(Buffer.from('voice'), 'u1', 'agent-1', 'sample.webm');
    expect(save).toHaveBeenCalledTimes(1);
    expectPrivate(save.mock.calls[0][1] as SaveOptions);
    expect(result?.publicUrl).toBeNull();
    expect(result?.filePath).toMatch(/^voice-clones\/u1\/agent-1\//);
  });
});

describe('processVoiceUpload', () => {
  it('stores each sample privately', async () => {
    await processVoiceUpload(
      'agent-1',
      [{ filename: 'sample.webm', buffer: new ArrayBuffer(4_000), mimeType: 'audio/webm' }],
      'u1'
    );
    expect(save).toHaveBeenCalledTimes(1);
    expectPrivate(save.mock.calls[0][1] as SaveOptions);
  });
});
