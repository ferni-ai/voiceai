/**
 * The upload route writes each voice-clone sample once, privately.
 *
 * It used to write every sample a second time with `public: true` (a 1-day
 * public cache, no cleanup) and save that storage.googleapis.com URL as the
 * agent's audioSampleUrl. Creating the bucket would have published people's
 * voice recordings at guessable URLs.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { save, updateAgentVoice } = vi.hoisted(() => {
  process.env.GCS_CUSTOM_AGENT_BUCKET = 'test-custom-agents';
  return {
    save: vi.fn(async (_buffer: Buffer, _options: Record<string, unknown>) => undefined),
    updateAgentVoice: vi.fn(async (_userId: string, _agentId: string, _voice: unknown) => true),
  };
});
vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket() {
      return { file: () => ({ save }) };
    }
  },
}));
vi.mock('../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: vi.fn(async () => ({ id: 'agent-1', name: 'Grandpa' })),
  updateAgentVoice,
}));

const { handleVoiceUpload } = await import('../voice-routes.js');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the upload route (VOICE_CLONE_CREATION on)', () => {
  it('writes the sample once, privately, and stores no storage.googleapis.com URL', async () => {
    vi.stubEnv('VOICE_CLONE_CREATION', 'on');
    const req = new EventEmitter() as IncomingMessage;
    req.method = 'POST';
    let raw = '';
    const res = {
      writeHead: vi.fn(),
      setHeader: vi.fn(),
      end: vi.fn((data?: string) => (raw = data ?? '')),
    } as unknown as ServerResponse;
    setTimeout(() => {
      req.emit('data', Buffer.from(JSON.stringify({ audio: Buffer.from('voice').toString('base64') })));
      req.emit('end');
    }, 0);

    await handleVoiceUpload(req, res, 'u1', 'agent-1');

    expect(save).toHaveBeenCalledTimes(1);
    const options = save.mock.calls[0][1] as { public?: unknown; predefinedAcl?: unknown };
    expect(options.public).not.toBe(true);
    expect(options.predefinedAcl).toBeUndefined();
    const stored = updateAgentVoice.mock.calls[0][2] as { audioSampleUrl: string };
    expect(stored.audioSampleUrl).not.toMatch(/^https?:/);
    expect(JSON.parse(raw).audioUrl).not.toMatch(/storage\.googleapis\.com/);
  });
});
