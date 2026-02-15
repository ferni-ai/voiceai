/**
 * Kyutai STT/TTS sidecar health checks.
 *
 * Use when USE_KYUTAI_STT or TTS_PROVIDER=kyutai to verify moshi-server
 * sidecars are reachable before routing traffic.
 *
 * @module speech/kyutai-health
 */

import WebSocket from 'ws';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'KyutaiHealth' });

const DEFAULT_STT_URL = 'ws://localhost:8089/api/asr-streaming';
const DEFAULT_TTS_URL = 'ws://localhost:8090/api/tts_streaming';
const CHECK_TIMEOUT_MS = 3000;

export interface KyutaiHealthResult {
  stt: { ok: boolean; url: string; latencyMs?: number; error?: string };
  tts: { ok: boolean; url: string; latencyMs?: number; error?: string };
  useKyutaiStt: boolean;
  useKyutaiTts: boolean;
}

function checkWs(url: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    let resolved = false;
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      resolve({ ok: false, latencyMs: Date.now() - start, error: 'timeout' });
    }, CHECK_TIMEOUT_MS);

    const ws = new WebSocket(url);
    ws.on('open', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      ws.close();
      resolve({ ok: true, latencyMs: Date.now() - start });
    });
    ws.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve({ ok: false, latencyMs: Date.now() - start, error: (err as Error).message });
    });
  });
}

/**
 * Check Kyutai STT and/or TTS sidecar connectivity.
 * Only checks URLs when USE_KYUTAI_STT or TTS_PROVIDER=kyutai (or USE_KYUTAI_TTS) is set.
 */
export async function checkKyutaiSidecars(): Promise<KyutaiHealthResult> {
  const useKyutaiStt = process.env.USE_KYUTAI_STT === 'true';
  const useKyutaiTts =
    process.env.TTS_PROVIDER === 'kyutai' || process.env.USE_KYUTAI_TTS === 'true';
  const sttUrl = process.env.KYUTAI_STT_URL || DEFAULT_STT_URL;
  const ttsUrl = process.env.KYUTAI_TTS_URL || DEFAULT_TTS_URL;

  const result: KyutaiHealthResult = {
    stt: { ok: false, url: sttUrl },
    tts: { ok: false, url: ttsUrl },
    useKyutaiStt,
    useKyutaiTts,
  };

  if (useKyutaiStt) {
    const sttCheck = await checkWs(sttUrl);
    result.stt = { ...result.stt, ok: sttCheck.ok, latencyMs: sttCheck.latencyMs, error: sttCheck.error };
    if (!sttCheck.ok) {
      log.warn({ url: sttUrl, error: sttCheck.error }, 'Kyutai STT sidecar unreachable');
    }
  } else {
    result.stt.ok = true; // not used, consider healthy
  }

  if (useKyutaiTts) {
    const ttsCheck = await checkWs(ttsUrl);
    result.tts = { ...result.tts, ok: ttsCheck.ok, latencyMs: ttsCheck.latencyMs, error: ttsCheck.error };
    if (!ttsCheck.ok) {
      log.warn({ url: ttsUrl, error: ttsCheck.error }, 'Kyutai TTS sidecar unreachable');
    }
  } else {
    result.tts.ok = true; // not used, consider healthy
  }

  return result;
}
