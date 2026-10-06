/**
 * Test helpers for web ↔ /api/voice contract tests.
 *
 * voiceApiFetch hands the web's fetch calls to the server's real voice route
 * handlers as one signed-in user (the x-firebase-uid header is what
 * bindVerifiedIdentity sets for a verified token). The caller's test file
 * must mock firebase-admin and src/memory/redis-cache.js (vi.mock is per file).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

import { handleEnrollmentRoutes } from '../../../../src/api/voice-auth/enrollment-routes.js';
import { handleVerificationRoutes } from '../../../../src/api/voice-auth/verification-routes.js';

export function voiceApiFetch(
  userId: string
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const body = typeof init?.body === 'string' ? [Buffer.from(init.body)] : [];
    const req = Object.assign(Readable.from(body), {
      method: init?.method ?? 'GET',
      url: url.pathname,
      headers: { 'x-firebase-uid': userId, 'content-type': 'application/json' },
      socket: { remoteAddress: '127.0.0.1' },
    });
    let status = 200;
    let sent = '';
    const res = {
      setHeader: () => undefined,
      writeHead: (code: number) => {
        status = code;
      },
      end: (data?: string) => {
        sent = data ?? '';
      },
    };
    // Dispatch as src/api/voice-auth/index.ts does (its other routes pull in Redis).
    const route = url.pathname.replace('/api/voice', '');
    const handle = route.startsWith('/enroll') ? handleEnrollmentRoutes : handleVerificationRoutes;
    const handled = await handle(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      route
    );
    if (!handled) throw new Error(`no route for ${url.pathname}`);
    return new Response(sent, { status, headers: { 'content-type': 'application/json' } });
  };
}

/**
 * 2 s of speech-like audio: syllables of varying length with a jittered,
 * vibrato pitch and noisy pauses. A pure tone is (rightly) refused by the
 * anti-spoofing check. Deterministic per seed.
 */
export function speech(seed: number, hz = 120): Float32Array {
  let s = seed >>> 0;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out = new Float32Array(32000);
  let i = 0;
  let phase = 0;
  while (i < out.length) {
    const syllable = Math.floor(16000 * (0.12 + rand() * 0.2));
    const f0 = hz * (0.9 + rand() * 0.2);
    for (let k = 0; k < syllable && i < out.length; k++, i++) {
      const vibrato = 1 + 0.03 * Math.sin((2 * Math.PI * 5 * k) / 16000);
      phase += (2 * Math.PI * (f0 * vibrato + (rand() - 0.5) * 4)) / 16000;
      const voiced =
        0.3 * Math.sin(phase) + 0.15 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase);
      out[i] = Math.sin((Math.PI * k) / syllable) * voiced + (rand() - 0.5) * 0.01;
    }
    const pause = Math.floor(16000 * (0.04 + rand() * 0.12));
    for (let k = 0; k < pause && i < out.length; k++, i++) out[i] = (rand() - 0.5) * 0.06;
  }
  return out;
}
