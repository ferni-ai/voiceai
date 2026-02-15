/**
 * Tests for HiggsPipelineProvider
 *
 * Validates the WebSocket-based TTS/STT provider for the Rust Higgs pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock WebSocket — vi.mock is hoisted, must be fully self-contained
// ============================================================================

// Global array to track mock WebSocket instances across tests
const MOCK_KEY = '__higgsPipelineMockWs';

interface MockWS {
  readyState: number;
  binaryType: string;
  sentMessages: Array<string | Buffer>;
  send(data: string | Buffer): void;
  close(): void;
  on(event: string, listener: (...args: unknown[]) => void): MockWS;
  emit(event: string, ...args: unknown[]): boolean;
  removeAllListeners(): MockWS;
  removeListener(event: string, listener: (...args: unknown[]) => void): MockWS;
  simulateOpen(): void;
  simulateMessage(data: string | Buffer): void;
  simulateError(err: Error): void;
  simulateClose(code?: number, reason?: string): void;
  getSentJson(): Array<Record<string, unknown>>;
}

function getMockInstances(): MockWS[] {
  if (!(globalThis as Record<string, unknown>)[MOCK_KEY]) {
    (globalThis as Record<string, unknown>)[MOCK_KEY] = [];
  }
  return (globalThis as Record<string, unknown>)[MOCK_KEY] as MockWS[];
}

function getLatestWs(): MockWS {
  const instances = getMockInstances();
  return instances[instances.length - 1];
}

vi.mock('ws', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('events') as typeof import('events');
  const KEY = '__higgsPipelineMockWs';

  class MockWebSocket extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = 0;
    binaryType = 'nodebuffer';
    sentMessages: Array<string | Buffer> = [];

    constructor(_url: string) {
      super();
      // Register in global tracking array
      if (!(globalThis as Record<string, unknown>)[KEY]) {
        (globalThis as Record<string, unknown>)[KEY] = [];
      }
      ((globalThis as Record<string, unknown>)[KEY] as unknown[]).push(this);

      // Auto-open after microtask
      setTimeout(() => {
        this.readyState = 1;
        this.emit('open');
      }, 0);
    }

    send(data: string | Buffer): void {
      this.sentMessages.push(data);
    }

    close(): void {
      this.readyState = 3;
      this.emit('close', 1000, Buffer.from('normal'));
    }

    simulateOpen(): void {
      this.readyState = 1;
      this.emit('open');
    }

    simulateMessage(data: string | Buffer): void {
      this.emit('message', data);
    }

    simulateError(err: Error): void {
      this.emit('error', err);
    }

    simulateClose(code = 1000, reason = 'normal'): void {
      this.readyState = 3;
      this.emit('close', code, Buffer.from(reason));
    }

    getSentJson(): Array<Record<string, unknown>> {
      return this.sentMessages
        .filter((m: string | Buffer): m is string => typeof m === 'string')
        .map((m: string) => JSON.parse(m) as Record<string, unknown>);
    }
  }

  return { WebSocket: MockWebSocket };
});

// ============================================================================
// Imports (after mock)
// ============================================================================

import {
  HiggsPipelineProvider,
  createHiggsPipelineProvider,
  getHiggsPipelineProvider,
  resetHiggsPipelineProvider,
} from '../higgs-pipeline.js';
import type { TranscriptResult, VoiceBiomarkers } from '../higgs-pipeline.js';

// ============================================================================
// HELPERS
// ============================================================================

function createAudioBuffer(sizeBytes: number): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) {
    buf[i] = i % 256;
  }
  return buf;
}

/** Helper: connect the provider and resolve a dummy synthesis */
async function connectProvider(provider: HiggsPipelineProvider): Promise<MockWS> {
  const p = provider.synthesize('connect', 'ferni');
  await vi.waitFor(() => expect(getMockInstances().length).toBeGreaterThan(0));
  const ws = getLatestWs();
  await vi.waitFor(() => {
    expect(ws.getSentJson().some((m) => m.type === 'synthesize')).toBe(true);
  });
  const synthMsg = ws.getSentJson().find((m) => m.type === 'synthesize')!;
  ws.simulateMessage(JSON.stringify({ type: 'audio_start', request_id: synthMsg.request_id }));
  ws.simulateMessage(JSON.stringify({ type: 'audio_done', duration_ms: 0, request_id: synthMsg.request_id }));
  await p;
  return ws;
}

// ============================================================================
// TESTS
// ============================================================================

describe('HiggsPipelineProvider', () => {
  let provider: HiggsPipelineProvider;

  beforeEach(() => {
    getMockInstances().length = 0;
    vi.clearAllMocks();
    resetHiggsPipelineProvider();
    provider = createHiggsPipelineProvider({
      serverUrl: 'ws://test:8600/ws',
      connectionTimeoutMs: 2000,
    });
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  // --------------------------------------------------------------------------
  // Constructor & Configuration
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('uses provider name higgs-pipeline', () => {
      expect(provider.name).toBe('higgs-pipeline');
    });

    it('uses env var when no config URL provided', () => {
      process.env.HIGGS_PIPELINE_URL = 'ws://env-host:9999/ws';
      const envProvider = createHiggsPipelineProvider();
      expect(envProvider.name).toBe('higgs-pipeline');
      delete process.env.HIGGS_PIPELINE_URL;
    });

    it('exposes reconnectDelayMs from config', () => {
      const p = createHiggsPipelineProvider({ reconnectDelayMs: 5000 });
      expect(p.reconnectDelayMs).toBe(5000);
    });
  });

  // --------------------------------------------------------------------------
  // Protocol Message Shapes
  // --------------------------------------------------------------------------

  describe('protocol message shapes', () => {
    it('sends start_session on connect', async () => {
      const ws = await connectProvider(provider);
      const msgs = ws.getSentJson();

      expect(msgs[0]).toMatchObject({
        type: 'start_session',
        persona: 'ferni',
      });
      expect(typeof msgs[0].session_id).toBe('string');
    });

    it('sends correct synthesize message shape', async () => {
      const ws = await connectProvider(provider);

      // Now do a synthesis with prosody
      const p2 = provider.synthesize('test text', 'ferni', {
        emotion: 'warm',
        emotionIntensity: 0.6,
      });

      await vi.waitFor(() => {
        expect(ws.getSentJson().filter((m) => m.type === 'synthesize').length).toBeGreaterThanOrEqual(2);
      });

      const synthMsgs = ws.getSentJson().filter((m) => m.type === 'synthesize');
      const lastSynth = synthMsgs[synthMsgs.length - 1];

      expect(lastSynth).toMatchObject({
        type: 'synthesize',
        text: 'test text',
        emotion: 'warm',
        intensity: 0.6,
      });
      expect(lastSynth).toHaveProperty('request_id');

      // Resolve
      ws.simulateMessage(JSON.stringify({ type: 'audio_start', request_id: lastSynth.request_id }));
      ws.simulateMessage(JSON.stringify({ type: 'audio_done', duration_ms: 100, request_id: lastSynth.request_id }));
      await p2;
    });
  });

  // --------------------------------------------------------------------------
  // synthesize()
  // --------------------------------------------------------------------------

  describe('synthesize()', () => {
    it('returns empty buffer for empty text', async () => {
      const result = await provider.synthesize('', 'ferni');
      expect(result.byteLength).toBe(0);
    });

    it('returns empty buffer for whitespace-only text', async () => {
      const result = await provider.synthesize('   ', 'ferni');
      expect(result.byteLength).toBe(0);
    });

    it('collects audio chunks and returns concatenated buffer', async () => {
      const ws = await connectProvider(provider);

      const synthesizePromise = provider.synthesize('hello world', 'ferni');

      await vi.waitFor(() => {
        expect(ws.getSentJson().filter((m) => m.type === 'synthesize').length).toBeGreaterThanOrEqual(2);
      });

      const synthMsgs = ws.getSentJson().filter((m) => m.type === 'synthesize');
      const reqId = synthMsgs[synthMsgs.length - 1].request_id as number;

      // Server sends audio_start
      ws.simulateMessage(JSON.stringify({ type: 'audio_start', sample_rate: 24000, request_id: reqId }));

      // Server sends 3 binary chunks
      ws.simulateMessage(createAudioBuffer(100));
      ws.simulateMessage(createAudioBuffer(200));
      ws.simulateMessage(createAudioBuffer(150));

      // Server signals done
      ws.simulateMessage(JSON.stringify({ type: 'audio_done', duration_ms: 1800, request_id: reqId }));

      const result = await synthesizePromise;
      expect(result.byteLength).toBe(450); // 100 + 200 + 150
    });
  });

  // --------------------------------------------------------------------------
  // synthesizeStreaming()
  // --------------------------------------------------------------------------

  describe('synthesizeStreaming()', () => {
    it('returns immediately for empty text', async () => {
      const gen = provider.synthesizeStreaming!('', 'ferni');
      const result = await gen.next();
      expect(result.done).toBe(true);
    });

    it('yields chunks as they arrive', async () => {
      const ws = await connectProvider(provider);

      const gen = provider.synthesizeStreaming!('stream test', 'ferni');
      const firstPromise = gen.next();

      await vi.waitFor(() => {
        expect(ws.getSentJson().some((m) => m.type === 'synthesize_streaming')).toBe(true);
      });

      const synthMsgs = ws.getSentJson().filter((m) => m.type === 'synthesize_streaming');
      const reqId = synthMsgs[synthMsgs.length - 1].request_id as number;

      // Send audio_start
      ws.simulateMessage(JSON.stringify({ type: 'audio_start', sample_rate: 24000, request_id: reqId }));

      // Send first chunk
      ws.simulateMessage(createAudioBuffer(100));

      const firstResult = await firstPromise;
      expect(firstResult.done).toBe(false);
      expect((firstResult.value as ArrayBuffer).byteLength).toBe(100);

      // Send second chunk
      const secondPromise = gen.next();
      ws.simulateMessage(createAudioBuffer(200));
      const secondResult = await secondPromise;
      expect(secondResult.done).toBe(false);
      expect((secondResult.value as ArrayBuffer).byteLength).toBe(200);

      // Signal done
      const thirdPromise = gen.next();
      ws.simulateMessage(JSON.stringify({ type: 'audio_done', duration_ms: 500, request_id: reqId }));
      const thirdResult = await thirdPromise;
      expect(thirdResult.done).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // isAvailable()
  // --------------------------------------------------------------------------

  describe('isAvailable()', () => {
    it('returns true when health endpoint responds OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('ok', { status: 200 })
      );
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when health endpoint fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('error', { status: 500 })
      );
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns false when fetch throws', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));
      expect(await provider.isAvailable()).toBe(false);
    });

    it('converts ws:// to http:// for health check URL', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('ok', { status: 200 })
      );
      await provider.isAvailable();
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://test:8600/health',
        expect.any(Object)
      );
    });
  });

  // --------------------------------------------------------------------------
  // estimateDuration()
  // --------------------------------------------------------------------------

  describe('estimateDuration()', () => {
    it('estimates duration based on ~150 WPM', () => {
      const duration = provider.estimateDuration('hello world test here');
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10000);
    });

    it('returns 0 for empty text', () => {
      expect(provider.estimateDuration('')).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // STT / Transcription
  // --------------------------------------------------------------------------

  describe('sendUserAudio()', () => {
    it('sends binary frame with PCM data', async () => {
      const ws = await connectProvider(provider);

      const samples = new Int16Array([100, -200, 300, -400]);
      await provider.sendUserAudio(samples);

      const binaryMessages = ws.sentMessages.filter((m) => Buffer.isBuffer(m));
      expect(binaryMessages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('triggerTranscription()', () => {
    it('sends transcribe message and resolves with transcript', async () => {
      const ws = await connectProvider(provider);

      const transcriptPromise = provider.triggerTranscription();

      await vi.waitFor(() => {
        expect(ws.getSentJson().some((m) => m.type === 'transcribe')).toBe(true);
      });

      const biomarkers: VoiceBiomarkers = {
        pitch_hz: 180,
        energy: -20,
        jitter: 0.02,
        shimmer: 0.03,
        breathiness: 0.1,
        speech_rate: 3.5,
        is_speech: true,
      };
      ws.simulateMessage(JSON.stringify({
        type: 'transcript',
        text: 'hello there',
        biomarkers,
        latency_ms: 150,
      }));

      const result: TranscriptResult = await transcriptPromise;
      expect(result.text).toBe('hello there');
      expect(result.latencyMs).toBe(150);
      expect(result.biomarkers?.pitch_hz).toBe(180);
      expect(result.biomarkers?.jitter).toBe(0.02);
      expect(result.biomarkers?.is_speech).toBe(true);
    });
  });

  describe('onTranscript()', () => {
    it('calls registered callbacks on transcript events', async () => {
      const callback = vi.fn();
      provider.onTranscript(callback);

      const ws = await connectProvider(provider);

      ws.simulateMessage(JSON.stringify({
        type: 'transcript',
        text: 'push event',
        latency_ms: 100,
      }));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'push event',
          latencyMs: 100,
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  describe('error handling', () => {
    it('rejects pending synthesis on server error', async () => {
      const ws = await connectProvider(provider);

      const synthesizePromise = provider.synthesize('fail me', 'ferni');

      await vi.waitFor(() => {
        expect(ws.getSentJson().filter((m) => m.type === 'synthesize').length).toBeGreaterThanOrEqual(2);
      });

      const synthMsgs = ws.getSentJson().filter((m) => m.type === 'synthesize');
      const reqId = synthMsgs[synthMsgs.length - 1].request_id;

      ws.simulateMessage(JSON.stringify({
        type: 'error',
        code: 'TTS_FAILED',
        message: 'Model not loaded',
        request_id: reqId,
      }));

      await expect(synthesizePromise).rejects.toThrow('TTS_FAILED');
    });

    it('rejects all pending on WebSocket close', async () => {
      const ws = await connectProvider(provider);

      const synthesizePromise = provider.synthesize('will disconnect', 'ferni');

      await vi.waitFor(() => {
        expect(ws.getSentJson().filter((m) => m.type === 'synthesize').length).toBeGreaterThanOrEqual(2);
      });

      // Close the WebSocket unexpectedly
      ws.simulateClose(1006, 'abnormal');

      await expect(synthesizePromise).rejects.toThrow('WebSocket closed');
    });

    it('handles malformed JSON from server gracefully', async () => {
      const ws = await connectProvider(provider);

      const synthesizePromise = provider.synthesize('test', 'ferni');

      await vi.waitFor(() => {
        expect(ws.getSentJson().filter((m) => m.type === 'synthesize').length).toBeGreaterThanOrEqual(2);
      });

      // Send malformed JSON — should not throw
      ws.simulateMessage('not valid json {{{');

      // Still resolve normally
      const synthMsgs = ws.getSentJson().filter((m) => m.type === 'synthesize');
      const reqId = synthMsgs[synthMsgs.length - 1].request_id;
      ws.simulateMessage(JSON.stringify({ type: 'audio_start', request_id: reqId }));
      ws.simulateMessage(JSON.stringify({ type: 'audio_done', duration_ms: 0, request_id: reqId }));

      const result = await synthesizePromise;
      expect(result.byteLength).toBe(0); // No audio chunks sent
    });
  });

  // --------------------------------------------------------------------------
  // Error Edge Cases (Fix 10)
  // --------------------------------------------------------------------------

  describe('error edge cases', () => {
    it('error with request_id routes to correct pending synthesis, not transcription', async () => {
      const ws = await connectProvider(provider);

      // Start a transcription AND a synthesis in parallel
      const transcriptPromise = provider.triggerTranscription();
      const synthesizePromise = provider.synthesize('test text', 'ferni');

      await vi.waitFor(() => {
        const msgs = ws.getSentJson();
        return (
          msgs.some((m) => m.type === 'transcribe') &&
          msgs.filter((m) => m.type === 'synthesize').length >= 2
        );
      });

      const synthMsgs = ws.getSentJson().filter((m) => m.type === 'synthesize');
      const reqId = synthMsgs[synthMsgs.length - 1].request_id;

      // Server sends error with the synthesis request_id
      ws.simulateMessage(JSON.stringify({
        type: 'error',
        code: 'SYNTHESIS_FAILED',
        message: 'Out of memory',
        request_id: reqId,
      }));

      // Synthesis should be rejected
      await expect(synthesizePromise).rejects.toThrow('SYNTHESIS_FAILED');

      // Transcription should NOT be rejected — resolve it normally
      ws.simulateMessage(JSON.stringify({
        type: 'transcript',
        text: 'hello',
        latency_ms: 50,
      }));
      const transcript = await transcriptPromise;
      expect(transcript.text).toBe('hello');
    });

    it('error without request_id rejects pending transcription', async () => {
      const ws = await connectProvider(provider);

      const transcriptPromise = provider.triggerTranscription();

      await vi.waitFor(() => {
        expect(ws.getSentJson().some((m) => m.type === 'transcribe')).toBe(true);
      });

      // Server sends error without request_id
      ws.simulateMessage(JSON.stringify({
        type: 'error',
        code: 'STT_FAILED',
        message: 'Whisper error',
      }));

      await expect(transcriptPromise).rejects.toThrow('STT_FAILED');
    });

    it('error with unknown request_id does not reject transcription', async () => {
      const ws = await connectProvider(provider);

      const transcriptPromise = provider.triggerTranscription();

      await vi.waitFor(() => {
        expect(ws.getSentJson().some((m) => m.type === 'transcribe')).toBe(true);
      });

      // Server sends error with a request_id that doesn't match any pending synthesis
      ws.simulateMessage(JSON.stringify({
        type: 'error',
        code: 'UNKNOWN_ERROR',
        message: 'Something failed',
        request_id: 99999,
      }));

      // Transcription should NOT be rejected — resolve it normally
      ws.simulateMessage(JSON.stringify({
        type: 'transcript',
        text: 'still works',
        latency_ms: 30,
      }));
      const transcript = await transcriptPromise;
      expect(transcript.text).toBe('still works');
    });

    it('audio_done for unknown request is handled gracefully', async () => {
      const ws = await connectProvider(provider);

      // Send audio_done with an ID that doesn't match any pending synthesis
      ws.simulateMessage(JSON.stringify({
        type: 'audio_done',
        duration_ms: 500,
        request_id: 99999,
      }));

      // Should not throw — provider should still be functional
      const p = provider.synthesize('after unknown audio_done', 'ferni');
      await vi.waitFor(() => {
        expect(ws.getSentJson().filter((m) => m.type === 'synthesize').length).toBeGreaterThanOrEqual(2);
      });

      const synthMsgs = ws.getSentJson().filter((m) => m.type === 'synthesize');
      const reqId = synthMsgs[synthMsgs.length - 1].request_id as number;
      ws.simulateMessage(JSON.stringify({ type: 'audio_start', request_id: reqId }));
      ws.simulateMessage(JSON.stringify({ type: 'audio_done', duration_ms: 0, request_id: reqId }));
      const result = await p;
      expect(result).toBeDefined();
    });

    it('audio chunk with no active request logs warning and drops', async () => {
      const ws = await connectProvider(provider);

      // Send binary audio chunk without any pending synthesis
      ws.simulateMessage(createAudioBuffer(100));

      // Provider should still function normally after dropped chunk
      const p = provider.synthesize('after orphan chunk', 'ferni');
      await vi.waitFor(() => {
        expect(ws.getSentJson().filter((m) => m.type === 'synthesize').length).toBeGreaterThanOrEqual(2);
      });
      const synthMsgs = ws.getSentJson().filter((m) => m.type === 'synthesize');
      const reqId = synthMsgs[synthMsgs.length - 1].request_id as number;
      ws.simulateMessage(JSON.stringify({ type: 'audio_start', request_id: reqId }));
      ws.simulateMessage(createAudioBuffer(50));
      ws.simulateMessage(JSON.stringify({ type: 'audio_done', duration_ms: 100, request_id: reqId }));
      const result = await p;
      expect(result.byteLength).toBe(50);
    });

    it('WebSocket close during synthesis rejects pending', async () => {
      const ws = await connectProvider(provider);

      const p1 = provider.synthesize('request one', 'ferni');
      const p2 = provider.synthesize('request two', 'ferni');

      await vi.waitFor(() => {
        expect(ws.getSentJson().filter((m) => m.type === 'synthesize').length).toBeGreaterThanOrEqual(3);
      });

      // Close mid-synthesis — both should reject
      ws.simulateClose(1006, 'connection lost');

      await expect(p1).rejects.toThrow('WebSocket closed');
      await expect(p2).rejects.toThrow('WebSocket closed');
    });
  });

  // --------------------------------------------------------------------------
  // Session Lifecycle
  // --------------------------------------------------------------------------

  describe('session lifecycle', () => {
    it('connects on first use and sends start_session', async () => {
      const ws = await connectProvider(provider);

      const msgs = ws.getSentJson();
      expect(msgs[0]).toMatchObject({ type: 'start_session' });
      expect(typeof msgs[0].session_id).toBe('string');
    });

    it('reuses existing connection for subsequent calls', async () => {
      const ws = await connectProvider(provider);
      const instanceCountAfterFirst = getMockInstances().length;

      // Second call — should reuse connection
      const p2 = provider.synthesize('second', 'ferni');

      await vi.waitFor(() => {
        expect(ws.getSentJson().filter((m) => m.type === 'synthesize').length).toBe(2);
      });

      expect(getMockInstances().length).toBe(instanceCountAfterFirst); // No new WebSocket

      const synthMsgs = ws.getSentJson().filter((m) => m.type === 'synthesize');
      const reqId = synthMsgs[1].request_id;
      ws.simulateMessage(JSON.stringify({ type: 'audio_start', request_id: reqId }));
      ws.simulateMessage(JSON.stringify({ type: 'audio_done', duration_ms: 0, request_id: reqId }));
      await p2;
    });

    it('disconnect() sends end_session and closes WebSocket', async () => {
      const ws = await connectProvider(provider);
      await provider.disconnect();

      const endMsg = ws.getSentJson().find((m) => m.type === 'end_session');
      expect(endMsg).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Factory Functions
  // --------------------------------------------------------------------------

  describe('factory functions', () => {
    it('getHiggsPipelineProvider returns singleton', () => {
      const a = getHiggsPipelineProvider();
      const b = getHiggsPipelineProvider();
      expect(a).toBe(b);
      resetHiggsPipelineProvider();
    });

    it('resetHiggsPipelineProvider clears singleton', () => {
      const a = getHiggsPipelineProvider();
      resetHiggsPipelineProvider();
      const b = getHiggsPipelineProvider();
      expect(a).not.toBe(b);
      resetHiggsPipelineProvider();
    });

    it('createHiggsPipelineProvider returns new instance each time', () => {
      const a = createHiggsPipelineProvider();
      const b = createHiggsPipelineProvider();
      expect(a).not.toBe(b);
    });
  });
});
