#!/usr/bin/env npx tsx
/**
 * Higgs pipeline latency benchmark (Mac / Rust native).
 * Measures TTS time-to-first-byte (TTFB) and end-to-end for synthesize_streaming.
 *
 * Usage:
 *   npx tsx scripts/higgs/benchmark-latency.ts
 *   HIGGS_PIPELINE_URL=ws://localhost:8600/ws npx tsx scripts/higgs/benchmark-latency.ts
 *
 * Requires the Higgs pipeline server running (e.g. STREAM_CHUNK_STEPS=12 for low latency).
 */

import WebSocket from 'ws';

const WS_URL = process.env.HIGGS_PIPELINE_URL ?? 'ws://localhost:8600/ws';
const TARGET_TTS_TTFB_MS = 250;

async function measureTtsStreaming(): Promise<{
  ttfbMs: number;
  totalMs: number;
  firstChunkSamples: number;
}> {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let ttfbMs: number | null = null;
    let totalMs: number | null = null;
    let firstChunkSamples = 0;
    const tStart = Date.now();
    let sentRequest = false;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      ws.removeAllListeners();
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve({
        ttfbMs: ttfbMs ?? -1,
        totalMs: totalMs ?? -1,
        firstChunkSamples,
      });
    };

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'start_session',
          session_id: `bench-${Date.now()}`,
          persona: 'ferni',
        })
      );
      // Send streaming TTS request after session start
      setTimeout(() => {
        if (done) return;
        sentRequest = true;
        (ws as WebSocket & { _requestStart?: number })._requestStart = Date.now();
        ws.send(
          JSON.stringify({
            type: 'synthesize_streaming',
            text: 'Hello. This is a short sentence for latency testing.',
            emotion: 'neutral',
            request_id: 1,
          })
        );
        // Cap wait
        setTimeout(finish, 15000);
      }, 500);
    });

    ws.on('message', (data: Buffer | string) => {
      const reqStart = (ws as WebSocket & { _requestStart?: number })._requestStart;
      const now = Date.now();
      if (Buffer.isBuffer(data) && data.length >= 2 && sentRequest && reqStart !== undefined) {
        if (ttfbMs === null) {
          ttfbMs = now - reqStart;
          firstChunkSamples = data.length / 2; // i16 = 2 bytes per sample
        }
      }
      if (typeof data === 'string') {
        try {
          const j = JSON.parse(data) as { type?: string; request_id?: number };
          if (j.type === 'audio_done' && j.request_id === 1 && reqStart !== undefined) {
            totalMs = now - reqStart;
            finish();
          }
        } catch {
          // ignore
        }
      }
    });

    ws.on('close', finish);
    ws.on('error', () => finish());
  });
}

function ok(ms: number, target: number): string {
  if (ms < 0) return 'N/A';
  return ms <= target ? 'OK' : 'MISS';
}

async function main(): Promise<void> {
  console.log('Higgs pipeline latency benchmark (TTS streaming)');
  console.log('  URL:', WS_URL);
  console.log('  Target TTFB:', TARGET_TTS_TTFB_MS, 'ms');
  console.log('');

  const tts = await measureTtsStreaming();

  console.log('--- Results ---');
  console.log('');
  console.log('| Metric       | Target   | Measured | Status |');
  console.log('|--------------|----------|----------|--------|');
  console.log(
    `| TTS TTFB      | ${TARGET_TTS_TTFB_MS} ms   | ${tts.ttfbMs >= 0 ? tts.ttfbMs + ' ms' : 'N/A'}   | ${ok(tts.ttfbMs, TARGET_TTS_TTFB_MS)} |`
  );
  console.log('');
  if (tts.totalMs >= 0) {
    console.log('TTS end-to-end:', tts.totalMs, 'ms');
  }
  if (tts.firstChunkSamples > 0) {
    console.log('First chunk:', tts.firstChunkSamples, 'samples (24kHz mono i16)');
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
