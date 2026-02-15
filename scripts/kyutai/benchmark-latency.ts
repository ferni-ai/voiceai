#!/usr/bin/env npx tsx
/**
 * Kyutai bridge latency benchmark.
 * Measures STT first interim, STT final, TTS TTFB vs better-than-human targets.
 * Requires bridge running (real mode). Usage:
 *   npx tsx scripts/kyutai/benchmark-latency.ts
 *   STT_URL=ws://... TTS_URL=ws://... npx tsx scripts/kyutai/benchmark-latency.ts
 */

import WebSocket from 'ws';

const STT_URL = process.env.KYUTAI_STT_URL ?? 'ws://127.0.0.1:8089/api/asr-streaming';
const TTS_URL = process.env.KYUTAI_TTS_URL ?? 'ws://127.0.0.1:8090/api/tts_streaming';

const STT_BYTES_PER_BLOCK = 2560;
const TARGET_FIRST_INTERIM_MS = 150;
const TARGET_STT_FINAL_MS = 300;
const TARGET_TTS_TTFB_MS = 250;

function generateSilencePcm(seconds: number): Buffer {
  const samples = 16000 * seconds;
  return Buffer.alloc(samples * 2);
}

async function measureStt(): Promise<{ firstInterimMs: number; finalMs: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(STT_URL);
    let firstInterimMs: number | null = null;
    let finalMs: number | null = null;
    const tStart = Date.now();
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
        firstInterimMs: firstInterimMs ?? -1,
        finalMs: finalMs ?? -1,
      });
    };

    ws.on('open', () => {
      const pcm = generateSilencePcm(2);
      for (let i = 0; i < pcm.length; i += STT_BYTES_PER_BLOCK) {
        ws.send(pcm.subarray(i, i + STT_BYTES_PER_BLOCK));
      }
      setTimeout(finish, 5000);
    });

    ws.on('message', (data: Buffer | string) => {
      const now = Date.now() - tStart;
      if (typeof data === 'string') {
        try {
          const j = JSON.parse(data) as { is_final?: boolean };
          if (j.is_final === false && firstInterimMs === null) firstInterimMs = now;
          if (j.is_final === true) {
            finalMs = now;
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

async function measureTts(): Promise<{ ttfbMs: number; totalMs: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(TTS_URL);
    let ttfbMs: number | null = null;
    let totalMs: number | null = null;
    const tStart = Date.now();
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
      });
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ text: 'Hello world', voice_id: 'ferni' }));
      setTimeout(finish, 10000);
    });

    ws.on('message', (data: Buffer | string) => {
      const now = Date.now() - tStart;
      if (Buffer.isBuffer(data) && ttfbMs === null) ttfbMs = now;
      if (typeof data === 'string') {
        try {
          const j = JSON.parse(data) as { done?: boolean };
          if (j.done === true) {
            totalMs = now;
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
  console.log('Kyutai bridge latency benchmark');
  console.log('  STT:', STT_URL);
  console.log('  TTS:', TTS_URL);
  console.log('');

  const [stt, tts] = await Promise.all([measureStt(), measureTts()]);

  console.log('--- Results vs better-than-human targets ---');
  console.log('');
  console.log('| Metric            | Target   | Measured | Status |');
  console.log('|-------------------|----------|----------|--------|');
  console.log(
    `| STT first interim | ${TARGET_FIRST_INTERIM_MS} ms   | ${stt.firstInterimMs >= 0 ? stt.firstInterimMs + ' ms' : 'N/A'}   | ${ok(stt.firstInterimMs, TARGET_FIRST_INTERIM_MS)} |`
  );
  console.log(
    `| STT final         | ${TARGET_STT_FINAL_MS} ms   | ${stt.finalMs >= 0 ? stt.finalMs + ' ms' : 'N/A'}   | ${ok(stt.finalMs, TARGET_STT_FINAL_MS)} |`
  );
  console.log(
    `| TTS TTFB          | ${TARGET_TTS_TTFB_MS} ms   | ${tts.ttfbMs >= 0 ? tts.ttfbMs + ' ms' : 'N/A'}   | ${ok(tts.ttfbMs, TARGET_TTS_TTFB_MS)} |`
  );
  console.log('');
  if (tts.totalMs >= 0) {
    console.log('TTS total:', tts.totalMs, 'ms');
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
