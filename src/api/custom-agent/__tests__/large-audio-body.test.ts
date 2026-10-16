/**
 * Routes that take base64 audio in a JSON body keep their own, larger cap.
 *
 * parseBody refuses bodies over 1 MB by default. The journal entry and voice
 * upload routes pass a cap sized to the audio they accept, so a few seconds of
 * real audio (about 2 MB as base64 here) still reach the route.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { transcribeAudioBuffer, processVoiceUpload } = vi.hoisted(() => ({
  transcribeAudioBuffer: vi.fn(async () => '[Transcription unavailable]'),
  processVoiceUpload: vi.fn(async () => {
    throw new Error('stop after the body was read');
  }),
}));
vi.mock('../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: vi.fn(async () => ({ id: 'agent-1', name: 'Grandpa', type: 'twin' })),
  addMemoryToAgent: vi.fn(),
  updateAgentVoice: vi.fn(),
}));
vi.mock('../../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer,
  extractMetadata: vi.fn(),
}));
vi.mock('../../../services/custom-agent/gcs-storage-service.js', () => ({
  uploadVoiceJournalEntry: vi.fn(),
}));
vi.mock('../../../services/custom-agent/voice-clone-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  processVoiceUpload,
}));

const { handleCreateJournalEntry } = await import('../journal-routes.js');
const { handleVoiceUpload } = await import('../voice-routes.js');

/** About 2 MB of JSON: twice the default cap. */
const AUDIO = Buffer.alloc(1_500_000, 7).toString('base64');

function post(body: unknown): { req: IncomingMessage; res: ServerResponse; status: () => number } {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  let status = 0;
  const res = {
    writeHead: vi.fn((code: number) => (status = code)),
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return { req, res, status: () => status };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('base64 audio bodies over the default cap', () => {
  it('reach the journal entry transcriber', async () => {
    const call = post({ audio: AUDIO, mimeType: 'audio/webm' });
    await handleCreateJournalEntry(call.req, call.res, 'u1', 'agent-1');

    expect(transcribeAudioBuffer).toHaveBeenCalledTimes(1);
    expect(call.status()).toBe(422); // the mocked transcriber found no words
  });

  it('reach the voice upload processing', async () => {
    vi.stubEnv('VOICE_CLONE_CREATION', 'on');
    const call = post({ audio: AUDIO });
    await handleVoiceUpload(call.req, call.res, 'u1', 'agent-1');

    expect(processVoiceUpload).toHaveBeenCalledTimes(1);
  });
});
