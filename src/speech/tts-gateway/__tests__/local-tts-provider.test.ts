/**
 * Local TTS Provider unit tests.
 *
 * Tests LocalTTSProvider against a mock HTTP server:
 * synthesize, voice resolution, availability, error handling.
 * Tests both 'custom' API (Python server) and 'openai' API (Rust servers).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import {
  LocalTTSProvider,
  resetLocalTTSProvider,
  convertF32leToS16le,
  convertWavToS16le,
} from '../providers/local-tts.js';

// ============================================================================
// MOCK HTTP TTS SERVER
// ============================================================================

let mockServer: http.Server;
let mockPort: number;
let lastRequest: Record<string, unknown> | null = null;
let shouldFail = false;
let shouldTimeout = false;
/** 'pcm' = raw s16le (custom API), 'wav' = WAV f32 (rust-mlx-omni), 'f32' = raw f32le (rust-perf) */
let responseFormat: 'pcm' | 'wav' | 'f32' = 'pcm';

/** Encode a f32 WAV file with 44-byte header. */
function encodeWavF32(samples: Float32Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 4;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);              // fmt chunk size
  buf.writeUInt16LE(3, 20);               // audio format: IEEE float
  buf.writeUInt16LE(1, 22);               // channels: mono
  buf.writeUInt32LE(sampleRate, 24);      // sample rate
  buf.writeUInt32LE(sampleRate * 4, 28);  // byte rate
  buf.writeUInt16LE(4, 32);               // block align
  buf.writeUInt16LE(32, 34);              // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buf.writeFloatLE(samples[i], 44 + i * 4);
  }
  return buf;
}

function startMockServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
        return;
      }

      // Custom API: POST /synthesize
      if (req.url === '/synthesize' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: string) => (body += chunk));
        req.on('end', () => {
          lastRequest = JSON.parse(body) as Record<string, unknown>;

          if (shouldFail) { res.writeHead(500); res.end('Internal error'); return; }
          if (shouldTimeout) { return; }

          // Return 100 samples of silence (200 bytes of s16le PCM)
          const pcm = Buffer.alloc(200, 0);
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(pcm.length),
          });
          res.end(pcm);
        });
        return;
      }

      // OpenAI API: POST /v1/audio/speech
      if (req.url === '/v1/audio/speech' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: string) => (body += chunk));
        req.on('end', () => {
          lastRequest = JSON.parse(body) as Record<string, unknown>;

          if (shouldFail) { res.writeHead(500); res.end('Internal error'); return; }
          if (shouldTimeout) { return; }

          // 10 samples of known values (0.5, -0.5 alternating)
          const samples = new Float32Array(10);
          for (let i = 0; i < 10; i++) samples[i] = i % 2 === 0 ? 0.5 : -0.5;

          if (responseFormat === 'wav') {
            const wav = encodeWavF32(samples, 24000);
            res.writeHead(200, {
              'Content-Type': 'audio/wav',
              'Content-Length': String(wav.length),
            });
            res.end(wav);
          } else {
            // Raw f32le bytes
            const f32Buf = Buffer.from(samples.buffer);
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(f32Buf.length),
            });
            res.end(f32Buf);
          }
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

// ============================================================================
// SETUP
// ============================================================================

beforeAll(async () => {
  const result = await startMockServer();
  mockServer = result.server;
  mockPort = result.port;
});

afterAll(() => {
  mockServer?.close();
});

afterEach(() => {
  lastRequest = null;
  shouldFail = false;
  shouldTimeout = false;
  responseFormat = 'pcm';
  resetLocalTTSProvider();
});

// ============================================================================
// TESTS
// ============================================================================

describe('LocalTTSProvider', () => {
  function createProvider(overrides?: Partial<ConstructorParameters<typeof LocalTTSProvider>[0]>) {
    return new LocalTTSProvider({
      serverUrl: `http://127.0.0.1:${mockPort}`,
      ...overrides,
    });
  }

  describe('synthesize', () => {
    it('sends text to the local server and returns PCM audio', async () => {
      const provider = createProvider();
      const audio = await provider.synthesize('Hello world', 'ferni');

      expect(audio.byteLength).toBe(200);
      expect(lastRequest).toMatchObject({
        text: 'Hello world',
        voice_id: 'ferni',
        sample_rate: 24000,
      });
    });

    it('returns empty buffer for empty text', async () => {
      const provider = createProvider();
      const audio = await provider.synthesize('', 'ferni');

      expect(audio.byteLength).toBe(0);
      expect(lastRequest).toBeNull();
    });

    it('returns empty buffer for whitespace-only text', async () => {
      const provider = createProvider();
      const audio = await provider.synthesize('   ', 'ferni');

      expect(audio.byteLength).toBe(0);
    });

    it('passes emotion from prosody config', async () => {
      const provider = createProvider();
      await provider.synthesize('I feel great', 'ferni', { emotion: 'happy' });

      expect(lastRequest?.emotion).toBe('happy');
    });

    it('passes speed from prosody config', async () => {
      const provider = createProvider();
      await provider.synthesize('Slow down', 'ferni', { speed: 0.8 });

      expect(lastRequest).toMatchObject({ text: 'Slow down' });
    });

    it('returns empty buffer on server error', async () => {
      shouldFail = true;
      const provider = createProvider();
      const audio = await provider.synthesize('Hello', 'ferni');

      expect(audio.byteLength).toBe(0);
    });

    it('returns empty buffer on timeout', async () => {
      shouldTimeout = true;
      const provider = createProvider({ timeoutMs: 200 });
      const audio = await provider.synthesize('Hello', 'ferni');

      expect(audio.byteLength).toBe(0);
    });

    it('returns empty buffer when server is unreachable', async () => {
      const provider = new LocalTTSProvider({
        serverUrl: 'http://127.0.0.1:1', // port 1 is not open
        timeoutMs: 500,
      });
      const audio = await provider.synthesize('Hello', 'ferni');

      expect(audio.byteLength).toBe(0);
    });
  });

  describe('voice resolution', () => {
    it('maps persona names to local voice IDs', async () => {
      const provider = createProvider();
      await provider.synthesize('Test', 'maya-santos');
      expect(lastRequest?.voice_id).toBe('maya');
    });

    it('maps short persona names', async () => {
      const provider = createProvider();
      await provider.synthesize('Test', 'alex');
      expect(lastRequest?.voice_id).toBe('alex');
    });

    it('falls back to default voice for Cartesia UUIDs', async () => {
      const provider = createProvider({ defaultVoice: 'default-voice' });
      await provider.synthesize('Test', 'a0e99841-438c-4a64-b679-ae501e7d6091');
      expect(lastRequest?.voice_id).toBe('default-voice');
    });

    it('passes through unknown short names as-is', async () => {
      const provider = createProvider();
      await provider.synthesize('Test', 'custom-voice-99');
      expect(lastRequest?.voice_id).toBe('custom-voice-99');
    });

    it('maps all Ferni team personas', async () => {
      const provider = createProvider();
      const expectedMappings: [string, string][] = [
        ['ferni', 'ferni'],
        ['maya-santos', 'maya'],
        ['peter-john', 'peter'],
        ['alex-chen', 'alex'],
        ['jordan-taylor', 'jordan'],
        ['nayan-patel', 'nayan'],
        ['joel-dickson', 'joel'],
        ['peter-lynch', 'lynch'],
        ['john-bogle', 'bogle'],
      ];

      for (const [personaId, expectedVoice] of expectedMappings) {
        await provider.synthesize('Test', personaId);
        expect(lastRequest?.voice_id).toBe(expectedVoice);
      }
    });
  });

  describe('isAvailable', () => {
    it('returns true when server is reachable', async () => {
      const provider = createProvider();
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when server is unreachable', async () => {
      const provider = new LocalTTSProvider({
        serverUrl: 'http://127.0.0.1:1',
      });
      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('estimateDuration', () => {
    it('estimates duration from text length', () => {
      const provider = createProvider();
      // "Hello world" = 11 chars / 5 chars_per_word = 2.2 words
      // 2.2 words / 150 wpm = 0.01467 min = 0.88 sec = 880ms
      const duration = provider.estimateDuration('Hello world');
      expect(duration).toBeGreaterThan(500);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('provider name', () => {
    it('has name "local"', () => {
      const provider = createProvider();
      expect(provider.name).toBe('local');
    });
  });

  // ==========================================================================
  // OpenAI API format (Rust servers)
  // ==========================================================================

  describe('openai API format', () => {
    function createOpenAIProvider(overrides?: Partial<ConstructorParameters<typeof LocalTTSProvider>[0]>) {
      return new LocalTTSProvider({
        serverUrl: `http://127.0.0.1:${mockPort}`,
        apiFormat: 'openai',
        ...overrides,
      });
    }

    it('sends to /v1/audio/speech with OpenAI request shape', async () => {
      responseFormat = 'f32';
      const provider = createOpenAIProvider();
      const audio = await provider.synthesize('Hello Rust', 'ferni');

      expect(audio.byteLength).toBeGreaterThan(0);
      expect(lastRequest).toMatchObject({
        input: 'Hello Rust',
        voice: 'ferni',
        model: 'tts-1',
      });
      // Should NOT have custom API fields
      expect(lastRequest).not.toHaveProperty('text');
      expect(lastRequest).not.toHaveProperty('voice_id');
    });

    it('converts WAV f32 response to s16le PCM', async () => {
      responseFormat = 'wav';
      const provider = createOpenAIProvider();
      const audio = await provider.synthesize('WAV test', 'ferni');

      // 10 f32 samples → 10 s16 samples → 20 bytes
      expect(audio.byteLength).toBe(20);

      // Verify conversion: 0.5 → ~16383, -0.5 → ~-16384
      const s16 = new Int16Array(audio);
      expect(s16[0]).toBe(16384); // 0.5 * 32767 rounded
      expect(s16[1]).toBe(-16384); // -0.5 * 32768 rounded
    });

    it('converts raw f32le response to s16le PCM', async () => {
      responseFormat = 'f32';
      const provider = createOpenAIProvider();
      const audio = await provider.synthesize('f32 test', 'ferni');

      // 10 f32 samples (40 bytes) → 10 s16 samples (20 bytes)
      expect(audio.byteLength).toBe(20);

      const s16 = new Int16Array(audio);
      expect(s16[0]).toBe(16384);
      expect(s16[1]).toBe(-16384);
    });

    it('resolves persona voices in openai mode', async () => {
      responseFormat = 'f32';
      const provider = createOpenAIProvider();
      await provider.synthesize('Test', 'maya-santos');

      expect(lastRequest).toMatchObject({ voice: 'maya' });
    });

    it('returns empty buffer on server error in openai mode', async () => {
      shouldFail = true;
      const provider = createOpenAIProvider();
      const audio = await provider.synthesize('Hello', 'ferni');

      expect(audio.byteLength).toBe(0);
    });

    it('returns empty buffer for empty text in openai mode', async () => {
      const provider = createOpenAIProvider();
      const audio = await provider.synthesize('', 'ferni');

      expect(audio.byteLength).toBe(0);
      expect(lastRequest).toBeNull();
    });
  });

  // ==========================================================================
  // Audio conversion utilities
  // ==========================================================================

  describe('audio conversion', () => {
    it('convertF32leToS16le converts float samples to 16-bit', () => {
      // Known values: 0.0, 1.0, -1.0, 0.5, -0.5
      const f32 = new Float32Array([0.0, 1.0, -1.0, 0.5, -0.5]);
      const result = convertF32leToS16le(f32.buffer);
      const s16 = new Int16Array(result);

      expect(s16[0]).toBe(0);         // 0.0
      expect(s16[1]).toBe(32767);     // 1.0 (max positive)
      expect(s16[2]).toBe(-32768);    // -1.0 (max negative)
      expect(s16[3]).toBe(16384);     // 0.5
      expect(s16[4]).toBe(-16384);    // -0.5
    });

    it('convertF32leToS16le clamps out-of-range values', () => {
      const f32 = new Float32Array([2.0, -3.0]);
      const result = convertF32leToS16le(f32.buffer);
      const s16 = new Int16Array(result);

      expect(s16[0]).toBe(32767);   // clamped to 1.0
      expect(s16[1]).toBe(-32768);  // clamped to -1.0
    });

    it('convertWavToS16le parses f32 WAV and converts', () => {
      const samples = new Float32Array([0.25, -0.75]);
      const wav = encodeWavF32(samples, 24000);
      const wavArrayBuffer = new Uint8Array(wav).buffer;
      const result = convertWavToS16le(wavArrayBuffer);
      const s16 = new Int16Array(result);

      expect(s16.length).toBe(2);
      expect(s16[0]).toBe(Math.round(0.25 * 32767));
      expect(s16[1]).toBe(Math.round(-0.75 * 32768));
    });

    it('convertWavToS16le returns s16 WAV data as-is', () => {
      // Build a s16 WAV manually
      const buf = Buffer.alloc(44 + 4); // 2 samples of s16
      buf.write('RIFF', 0);
      buf.writeUInt32LE(36 + 4, 4);
      buf.write('WAVE', 8);
      buf.write('fmt ', 12);
      buf.writeUInt32LE(16, 16);
      buf.writeUInt16LE(1, 20);        // PCM integer
      buf.writeUInt16LE(1, 22);        // mono
      buf.writeUInt32LE(24000, 24);
      buf.writeUInt32LE(48000, 28);
      buf.writeUInt16LE(2, 32);
      buf.writeUInt16LE(16, 34);       // 16-bit
      buf.write('data', 36);
      buf.writeUInt32LE(4, 40);
      buf.writeInt16LE(1000, 44);
      buf.writeInt16LE(-2000, 46);

      const bufArrayBuffer = new Uint8Array(buf).buffer;
      const result = convertWavToS16le(bufArrayBuffer);
      const s16 = new Int16Array(result);

      expect(s16.length).toBe(2);
      expect(s16[0]).toBe(1000);
      expect(s16[1]).toBe(-2000);
    });
  });
});
