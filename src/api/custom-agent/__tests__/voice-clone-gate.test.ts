/**
 * Voice cloning stays off until there is a consent design (VOICE_CLONE_CREATION).
 *
 * The flow took any uploaded audio file and had no consent step, so anyone's
 * voice could be cloned. While the flag is off the upload and clone routes
 * answer 403 before they read the body, look up the agent, store anything or
 * call Cartesia. With it on, the existing path still runs end to end.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCustomAgent, updateAgentVoice } = vi.hoisted(() => {
  // The service reads these at import: a key so the real provider path runs,
  // and no bucket so samples stay in memory for this file.
  process.env.CARTESIA_API_KEY = 'test-cartesia-key';
  delete process.env.GCS_CUSTOM_AGENT_BUCKET;
  delete process.env.GCS_VOICE_BUCKET;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  return {
    getCustomAgent: vi.fn(async (_userId: string, _agentId: string) => ({
      id: 'agent-1',
      name: 'Grandpa',
      voice: undefined,
    })),
    updateAgentVoice: vi.fn(async (_userId: string, _agentId: string, _voice: unknown) => true),
  };
});
vi.mock('../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent,
  updateAgentVoice,
}));

const { handleVoiceUpload, handleVoiceClone } = await import('../voice-routes.js');

const fetchSpy = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
  new Response(
    JSON.stringify({ id: 'voice_real_1', name: 'Grandpa', is_public: false, created_at: '2026-10-13' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
);

function post(body: unknown) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  let status = 0;
  let raw = '';
  const res = {
    writeHead: vi.fn((code: number) => (status = code)),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => (raw = data ?? '')),
  } as unknown as ServerResponse;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return { req, res, result: () => ({ status, body: raw ? JSON.parse(raw) : null }) };
}

/** About 18 s of estimated audio: over the 10 s of speech the service requires. */
const SAMPLE = Buffer.alloc(300_000, 7).toString('base64');

function cartesiaCalls(): unknown[][] {
  return fetchSpy.mock.calls.filter(([url]) => String(url).startsWith('https://api.cartesia.ai'));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy);
  fetchSpy.mockClear();
  getCustomAgent.mockClear();
  updateAgentVoice.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('with VOICE_CLONE_CREATION off (the default)', () => {
  it('refuses the upload honestly and stores nothing', async () => {
    const { req, res, result } = post({ audio: SAMPLE, mimeType: 'audio/webm' });
    expect(await handleVoiceUpload(req, res, 'u1', 'agent-1')).toBe(true);
    expect(result()).toEqual({ status: 403, body: { error: 'voice_clone_unavailable' } });
    expect(getCustomAgent).not.toHaveBeenCalled();
    expect(updateAgentVoice).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses the clone and never calls Cartesia', async () => {
    const { req, res, result } = post({ userName: 'Seth', uploadId: 'upload_anything' });
    expect(await handleVoiceClone(req, res, 'u1', 'agent-1')).toBe(true);
    expect(result()).toEqual({ status: 403, body: { error: 'voice_clone_unavailable' } });
    expect(getCustomAgent).not.toHaveBeenCalled();
    expect(updateAgentVoice).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stays off for a value that is not on', async () => {
    vi.stubEnv('VOICE_CLONE_CREATION', 'off');
    const { req, res, result } = post({ userName: 'Seth' });
    await handleVoiceClone(req, res, 'u1', 'agent-1');
    expect(result().status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('with VOICE_CLONE_CREATION on', () => {
  it('runs the existing upload then clone path through to Cartesia', async () => {
    vi.stubEnv('VOICE_CLONE_CREATION', 'on');

    const upload = post({ audio: SAMPLE, mimeType: 'audio/webm', filename: 'sample.webm' });
    await handleVoiceUpload(upload.req, upload.res, 'u1', 'agent-1');
    const uploaded = upload.result();
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.uploadId).toMatch(/^upload_/);
    // The stored sample reference is the private upload, never a fetchable URL.
    expect(uploaded.body.audioUrl).toBe(`upload://${uploaded.body.uploadId}`);
    expect(updateAgentVoice).toHaveBeenCalledWith('u1', 'agent-1', {
      type: 'cloned',
      audioSampleUrl: `upload://${uploaded.body.uploadId}`,
      status: 'pending',
    });

    const clone = post({ userName: 'Seth', uploadId: uploaded.body.uploadId });
    await handleVoiceClone(clone.req, clone.res, 'u1', 'agent-1');
    expect(clone.result().status).toBe(200);
    expect(clone.result().body.voice.voiceId).toBe('voice_real_1');
    expect(cartesiaCalls()).toHaveLength(1);
    expect(String(cartesiaCalls()[0][0])).toBe('https://api.cartesia.ai/voices/clone');
  });
});
