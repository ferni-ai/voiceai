/**
 * Local TTS Provider unit tests.
 *
 * Tests LocalTTSProvider against a mock HTTP server:
 * synthesize, voice resolution, availability, error handling.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import {
  LocalTTSProvider,
  resetLocalTTSProvider,
} from '../providers/local-tts.js';

// ============================================================================
// MOCK HTTP TTS SERVER
// ============================================================================

let mockServer: http.Server;
let mockPort: number;
let lastRequest: { text: string; voice_id: string; sample_rate?: number; emotion?: string } | null =
  null;
let shouldFail = false;
let shouldTimeout = false;

function startMockServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
        return;
      }

      if (req.url === '/synthesize' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          lastRequest = JSON.parse(body);

          if (shouldFail) {
            res.writeHead(500);
            res.end('Internal error');
            return;
          }

          if (shouldTimeout) {
            // Don't respond — let the client timeout
            return;
          }

          // Return 100 samples of silence (200 bytes of 16-bit PCM)
          const pcm = Buffer.alloc(200, 0);
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(pcm.length),
          });
          res.end(pcm);
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
});
