/**
 * Higgs MLX TTS Provider unit tests.
 *
 * Tests the HiggsMLXTTSProvider with a mock WebSocket server that
 * implements the Higgs MLX protocol (JSON control + binary PCM).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import {
  HiggsMLXTTSProvider,
  resetHiggsMLXProvider,
  getHiggsMLXProvider,
} from '../tts-gateway/providers/higgs-mlx.js';

// ────────────────────────────────────────────────────────────────────────────
// Mock Server
// ────────────────────────────────────────────────────────────────────────────

interface MockHiggsServer {
  port: number;
  wsUrl: string;
  close: () => Promise<void>;
  lastSynthText: string | null;
}

function startMockHiggsServer(): Promise<MockHiggsServer> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 });
    let lastSynthText: string | null = null;

    wss.on('connection', (ws) => {
      ws.on('message', (data: Buffer | string) => {
        if (typeof data !== 'string') return;
        try {
          const msg = JSON.parse(data);

          if (msg.type === 'StartSession') {
            ws.send(JSON.stringify({ type: 'SessionStarted' }));
          } else if (msg.type === 'Synthesize') {
            lastSynthText = msg.text;
            // Send some mock audio chunks
            const pcm = new Float32Array(480).fill(0.1);
            const buf = Buffer.from(pcm.buffer);
            ws.send(buf);
            ws.send(
              JSON.stringify({
                type: 'SynthesisComplete',
                request_id: msg.request_id,
                tokens_per_sec: 75.2,
                rtf: 0.33,
              })
            );
          } else if (msg.type === 'SynthesizeStreaming') {
            lastSynthText = msg.text;
            // Send two chunks then complete
            const chunk1 = Buffer.from(new Float32Array(240).fill(0.05).buffer);
            const chunk2 = Buffer.from(new Float32Array(240).fill(0.1).buffer);
            ws.send(
              JSON.stringify({ type: 'AudioChunk', request_id: msg.request_id, samples: 240 })
            );
            ws.send(chunk1);
            ws.send(
              JSON.stringify({ type: 'AudioChunk', request_id: msg.request_id, samples: 240 })
            );
            ws.send(chunk2);
            ws.send(
              JSON.stringify({
                type: 'StreamComplete',
                request_id: msg.request_id,
                tokens_per_sec: 72.0,
                rtf: 0.35,
              })
            );
          } else if (msg.type === 'EndSession') {
            ws.send(JSON.stringify({ type: 'SessionEnded' }));
          }
        } catch {
          // Ignore parse errors
        }
      });
    });

    wss.on('listening', () => {
      const addr = wss.address();
      const port = typeof addr === 'object' ? addr!.port : 0;
      resolve({
        port,
        wsUrl: `ws://localhost:${port}`,
        close: () =>
          new Promise<void>((r) => {
            wss.close(() => r());
          }),
        get lastSynthText() {
          return lastSynthText;
        },
      });
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('HiggsMLXTTSProvider', () => {
  let mock: MockHiggsServer;
  let provider: HiggsMLXTTSProvider;

  beforeAll(async () => {
    mock = await startMockHiggsServer();
    provider = new HiggsMLXTTSProvider({
      serverUrl: mock.wsUrl,
      healthUrl: `http://localhost:${mock.port}/health`,
      connectionTimeoutMs: 3000,
    });
  });

  afterEach(() => {
    resetHiggsMLXProvider();
  });

  afterAll(async () => {
    await provider.disconnect();
    await mock.close();
  });

  it('has correct provider name', () => {
    expect(provider.name).toBe('higgs-mlx');
  });

  it('synthesizes text and returns PCM audio buffer', async () => {
    const result = await provider.synthesize('Hello world', 'default');
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it('strips SSML tags before sending to server', async () => {
    await provider.synthesize(
      '<speak><prosody rate="slow">Hello <break time="200ms"/> world</prosody></speak>',
      'default'
    );
    expect(mock.lastSynthText).toBe('Hello world');
  });

  it('streams audio chunks via synthesizeStreaming', async () => {
    const chunks: ArrayBuffer[] = [];
    for await (const chunk of provider.synthesizeStreaming('Stream test', 'default')) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const totalBytes = chunks.reduce((s, c) => s + c.byteLength, 0);
    expect(totalBytes).toBeGreaterThan(0);
  });

  it('estimates duration from text length', () => {
    const shortDuration = provider.estimateDuration('Hello');
    const longDuration = provider.estimateDuration(
      'This is a much longer sentence that should take more time to speak aloud'
    );
    expect(longDuration).toBeGreaterThan(shortDuration);
    expect(shortDuration).toBeGreaterThan(0);
  });

  it('isAvailable returns false for non-existent health endpoint', async () => {
    const isolated = new HiggsMLXTTSProvider({
      serverUrl: 'ws://localhost:1',
      healthUrl: 'http://localhost:1/health',
    });
    const available = await isolated.isAvailable();
    expect(available).toBe(false);
  });

  it('getHiggsMLXProvider returns singleton', () => {
    // Set env so the singleton can be created with mock URL
    const origUrl = process.env.HIGGS_MLX_URL;
    process.env.HIGGS_MLX_URL = mock.wsUrl;

    const p1 = getHiggsMLXProvider();
    const p2 = getHiggsMLXProvider();
    expect(p1).toBe(p2);

    resetHiggsMLXProvider();
    if (origUrl) process.env.HIGGS_MLX_URL = origUrl;
    else delete process.env.HIGGS_MLX_URL;
  });

  it('disconnect gracefully closes connection', async () => {
    // Trigger a connection
    await provider.synthesize('test', 'default');
    // Should not throw
    await provider.disconnect();
  });
});
