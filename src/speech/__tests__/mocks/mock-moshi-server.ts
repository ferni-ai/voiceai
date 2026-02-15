/**
 * Mock moshi-server for Kyutai STT/TTS tests.
 *
 * Implements the same WebSocket protocol as Kyutai's moshi-server:
 * - STT: /api/asr-streaming — accept binary PCM, respond with JSON { text, is_final, vad, is_speaking }
 * - TTS: /api/tts_streaming — accept JSON { text, voice_id }, respond with binary PCM + optional { done: true }
 *
 * Use in tests: start in beforeAll, pass sttUrl/ttsUrl to clients, stop in afterAll.
 */

import { createServer } from 'http';
import type { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';

export interface MockMoshiServerOptions {
  /** Emit interim transcript before final (default: true) */
  sttInterim?: boolean;
  /** STT response text (default: "mock transcript") */
  sttText?: string;
  /** TTS PCM chunk size in samples (default: 480 = 10ms at 48kHz, we use 24kHz so 240) */
  ttsChunkSamples?: number;
  /** TTS sample rate (default: 24000) */
  ttsSampleRate?: number;
  /** TTS: accept connection but never send response (for timeout tests) */
  ttsSilent?: boolean;
}

export interface MockMoshiServerResult {
  sttPort: number;
  ttsPort: number;
  sttUrl: string;
  ttsUrl: string;
  close: () => Promise<void>;
}

const DEFAULT_STT_TEXT = 'mock transcript';
const DEFAULT_TTS_SAMPLE_RATE = 24000;
const DEFAULT_TTS_CHUNK_SAMPLES = 240; // 10ms at 24kHz

/**
 * Create and start a mock moshi-server (STT + TTS) on random ports.
 */
export async function startMockMoshiServer(
  options: MockMoshiServerOptions = {}
): Promise<MockMoshiServerResult> {
  const sttInterim = options.sttInterim ?? true;
  const sttText = options.sttText ?? DEFAULT_STT_TEXT;
  const ttsChunkSamples = options.ttsChunkSamples ?? DEFAULT_TTS_CHUNK_SAMPLES;
  const ttsSampleRate = options.ttsSampleRate ?? DEFAULT_TTS_SAMPLE_RATE;
  const ttsSilent = options.ttsSilent ?? false;

  const httpServer = createServer();
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    const path = request.url ?? '/';
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, path);
    });
  });

  wss.on('connection', (ws, request: IncomingMessage) => {
    const path = request.url ?? '/';
    if (path === '/api/asr-streaming' || path.startsWith('/api/asr-streaming')) {
      handleSTTConnection(ws, { sttInterim, sttText });
    } else if (path === '/api/tts_streaming' || path.startsWith('/api/tts_streaming')) {
      handleTTSConnection(ws, { ttsChunkSamples, ttsSampleRate, ttsSilent });
    } else {
      ws.close();
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (httpServer.address() as { port: number }).port;
  const baseUrl = `ws://127.0.0.1:${port}`;

  return {
    sttPort: port,
    ttsPort: port,
    sttUrl: `${baseUrl}/api/asr-streaming`,
    ttsUrl: `${baseUrl}/api/tts_streaming`,
    close: () =>
      new Promise((resolve) => {
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      }),
  };
}

function handleSTTConnection(
  ws: WebSocket,
  opts: { sttInterim: boolean; sttText: string }
): void {
  let receivedBytes = 0;
  let interimSent = false;
  let finalSent = false;
  ws.on('message', (data: Buffer | ArrayBuffer) => {
    if (Buffer.isBuffer(data)) {
      receivedBytes += data.length;
    } else {
      receivedBytes += (data as ArrayBuffer).byteLength;
    }
    if (opts.sttInterim && receivedBytes >= 320 && !interimSent) {
      interimSent = true;
      ws.send(JSON.stringify({ text: opts.sttText.slice(0, 5), is_final: false }));
    }
    if (receivedBytes >= 320 && !finalSent) {
      finalSent = true;
      ws.send(JSON.stringify({ text: opts.sttText, is_final: true }));
      ws.send(JSON.stringify({ vad: false, is_speaking: false }));
    }
  });
}

function handleTTSConnection(
  ws: WebSocket,
  opts: { ttsChunkSamples: number; ttsSampleRate: number; ttsSilent: boolean }
): void {
  let gotRequest = false;
  ws.on('message', (data: Buffer | ArrayBuffer | string) => {
    if (gotRequest) return;
    const str =
      typeof data === 'string'
        ? data
        : Buffer.isBuffer(data)
          ? data.toString('utf8')
          : Buffer.from(new Uint8Array(data)).toString('utf8');
    try {
      const obj = JSON.parse(str) as { text?: string; voice_id?: string };
      if (typeof obj.text === 'string') {
        gotRequest = true;
        if (opts.ttsSilent) return;
        // Send a few chunks of silence (Int16 PCM)
        const chunk = Buffer.alloc(opts.ttsChunkSamples * 2);
        for (let i = 0; i < 5; i++) {
          ws.send(chunk);
        }
        ws.send(JSON.stringify({ done: true }));
        ws.close();
      }
    } catch {
      // ignore
    }
  });
}
