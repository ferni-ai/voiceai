/**
 * Web enrollment through the real /api/voice routes, with the real liveness
 * and anti-spoofing checks (nothing mocked but Firebase and Redis).
 *
 * Liveness without a challenge refuses all real speech (0 of 40 LibriSpeech
 * utterances, see SECURITY_CONFIG.enrollmentLivenessBlocks), so enrollment
 * scores it without being refused on it; anti-spoofing still gates enrollment
 * and verification still enforces liveness. The neural model is #280's
 * waveform-contract fixture, or, where present, the REAL pinned model on real
 * people: SPEAKER_MODEL_TEST_PATH=<model> VOICE_CORPUS_DIR=<LibriSpeech/dev-clean>
 * (CC BY 4.0, openslr.org/12) with ffmpeg on PATH; skipped elsewhere.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin', () => {
  const unavailable = (): never => {
    throw new Error('no Firebase in this test');
  };
  return { default: { apps: [], initializeApp: unavailable, firestore: unavailable } };
});
// No Redis: enrollment sessions and profiles use the in-memory fallbacks.
vi.mock('../../memory/redis-cache.js', () => ({ getRedisCache: () => null }));

import {
  PINNED_SPEAKER_MODEL_SHA256,
  resetSpeakerEmbeddingWorker,
} from '../../services/voice/speaker-embedding-worker.js';
import { verifyUser } from '../../services/voice/voice-enrollment.js';
import { checkLiveness } from '../../services/voice/voice-liveness.js';
import { deleteVoiceProfile, loadVoiceProfile } from '../../services/voice/voice-profile-store.js';
import { resetIPRateLimit, resetUserRateLimit } from '../../services/voice/voice-rate-limit.js';
import { sha256Of, useSpeakerModel } from '../../services/voice/__tests__/speaker-model-fixture.js';
import { handleEnrollmentRoutes } from '../voice-auth/enrollment-routes.js';
import { handleVerificationRoutes } from '../voice-auth/verification-routes.js';

vi.setConfig({ testTimeout: 30_000 });

const USER = 'user-enrollment-liveness';
const RATE = 16000;
const FIXTURE = join(__dirname, '../../services/voice/__tests__/fixtures/waveform-contract.onnx');

/** POST/GET a /api/voice route the way the web client does (signed-in uid header). */
async function call(
  route: string,
  body?: Record<string, unknown>,
  user = USER
): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), {
    method: body ? 'POST' : 'GET',
    url: `/api/voice${route}`,
    headers: { 'x-firebase-uid': user, 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 200;
  let sent = '{}';
  const res = {
    setHeader: () => undefined,
    writeHead: (code: number) => void (status = code),
    end: (data?: string) => void (sent = data ?? '{}'),
  };
  const handle = route.startsWith('/enroll') ? handleEnrollmentRoutes : handleVerificationRoutes;
  const handled = await handle(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    route
  );
  if (!handled) throw new Error(`no route for ${route}`);
  return { status, json: JSON.parse(sent) as Record<string, unknown> };
}

/** 3 s of speech-like audio (jittered voiced syllables, noisy pauses), as the web uploads. */
function speechLike(seed: number, hz = 120): Float32Array {
  let s = seed >>> 0;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out = new Float32Array(3 * RATE);
  let i = 0;
  let phase = 0;
  while (i < out.length) {
    const syllable = Math.floor(RATE * (0.12 + rand() * 0.2));
    const f0 = hz * (0.9 + rand() * 0.2);
    for (let k = 0; k < syllable && i < out.length; k++, i++) {
      const vibrato = 1 + 0.03 * Math.sin((2 * Math.PI * 5 * k) / RATE);
      phase += (2 * Math.PI * (f0 * vibrato + (rand() - 0.5) * 4)) / RATE;
      const voiced =
        0.3 * Math.sin(phase) + 0.15 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase);
      out[i] = Math.sin((Math.PI * k) / syllable) * voiced + (rand() - 0.5) * 0.01;
    }
    const pause = Math.floor(RATE * (0.04 + rand() * 0.12));
    for (let k = 0; k < pause && i < out.length; k++, i++) out[i] = (rand() - 0.5) * 0.06;
  }
  return out;
}

/** start, one /enroll/sample per clip, complete: the web modal's calls. */
async function enroll(clips: Float32Array[], user = USER): Promise<number[]> {
  expect((await call('/enroll/start', { requiredSamples: clips.length }, user)).status).toBe(200);
  const statuses: number[] = [];
  for (const clip of clips) {
    // eslint-disable-next-line no-await-in-loop -- sequential, like the modal
    const added = await call('/enroll/sample', { samples: Array.from(clip) }, user);
    statuses.push(added.status);
  }
  statuses.push((await call('/enroll/complete', {}, user)).status);
  return statuses;
}

async function useModel(path: string | undefined): Promise<void> {
  await resetSpeakerEmbeddingWorker();
  useSpeakerModel(path);
}

beforeEach(async () => {
  resetUserRateLimit(USER);
  resetIPRateLimit('127.0.0.1');
  await call('/enroll/cancel', {});
  await deleteVoiceProfile(USER);
  await useModel(FIXTURE);
});

afterAll(async () => {
  await useModel(undefined);
});

describe('enrollment sample route: liveness is scored, not a gate', () => {
  it('enrolls a sample the liveness check refuses and reports its score', async () => {
    const sample = speechLike(1);
    const liveness = await checkLiveness(sample, RATE);
    expect(liveness.isLive).toBe(false);

    expect((await call('/enroll/start', { requiredSamples: 3 })).status).toBe(200);
    const added = await call('/enroll/sample', { samples: Array.from(sample) });
    expect(added.status).toBe(200);
    expect(added.json.success).toBe(true);
    const security = added.json.security as { livenessScore: number };
    expect(security.livenessScore).toBeCloseTo(liveness.confidence, 6);
  });

  it('still refuses a pure tone (anti-spoofing gates enrollment)', async () => {
    const tone = Float32Array.from(
      { length: 3 * RATE },
      (_, i) => Math.sin((2 * Math.PI * 220 * i) / RATE) * 0.3
    );
    expect((await call('/enroll/start', { requiredSamples: 3 })).status).toBe(200);
    const added = await call('/enroll/sample', { samples: Array.from(tone) });
    expect(added.status).toBe(403);
    expect(added.json.error).toBe('Security check failed');
  });

  it('verification still enforces liveness', async () => {
    // Another user: the refusals above count toward this one's suspicious-activity score
    const verify = await call(
      '/verify',
      { samples: Array.from(speechLike(1)) },
      'user-verify-liveness'
    );
    expect(verify.status).toBe(403);
    expect(verify.json.error).toBe('Security check failed');
  });
});

describe('web enrollment on the UI server routes', () => {
  it('with the neural model loaded: /status says neural, and the print verifies', async () => {
    const status = await call('/status');
    expect(status.json.method).toBe('neural');

    const clips = [speechLike(1), speechLike(2), speechLike(3)];
    expect(await enroll(clips)).toEqual([200, 200, 200, 200]);
    const profile = await loadVoiceProfile(USER);
    expect(profile?.embeddingMethod).toBe('neural');
    const check = await verifyUser(clips[0] as Float32Array, profile!);
    expect(check.verified).toBe(true);
    expect(check.userId).toBe(USER);
  });

  it('kill switch (SPEAKER_MODEL_PATH unset): /status says dsp, and its print never verifies', async () => {
    await useModel(undefined);
    expect((await call('/status')).json.method).toBe('dsp');

    const clips = [speechLike(1), speechLike(2), speechLike(3)];
    expect(await enroll(clips)).toEqual([200, 200, 200, 200]);
    const profile = await loadVoiceProfile(USER);
    expect(profile?.embeddingMethod).toBe('dsp');
    expect((await verifyUser(clips[0] as Float32Array, profile!)).verified).toBe(false);
  });
});

const MODEL = process.env.SPEAKER_MODEL_TEST_PATH ?? '/models/speaker/ecapa-tdnn-waveform.onnx';
const CORPUS = process.env.VOICE_CORPUS_DIR ?? '';
const realAvailable =
  existsSync(MODEL) &&
  existsSync(CORPUS) &&
  spawnSync('which', ['ffmpeg']).status === 0 &&
  sha256Of(MODEL) === PINNED_SPEAKER_MODEL_SHA256;

/** The first 3 s of a speaker's utterances, decoded to 16 kHz mono float32. */
function utterances(speaker: string, count: number): Float32Array[] {
  const dir = join(CORPUS, speaker);
  const files = readdirSync(dir)
    .flatMap((chapter) => {
      const path = join(dir, chapter);
      if (!statSync(path).isDirectory()) return [];
      return readdirSync(path)
        .filter((f) => f.endsWith('.flac'))
        .map((f) => join(path, f));
    })
    .sort()
    .slice(0, count);
  return files.map((file) => {
    const raw = execFileSync(
      'ffmpeg',
      [
        '-loglevel',
        'error',
        '-i',
        file,
        '-ac',
        '1',
        '-ar',
        String(RATE),
        '-t',
        '3',
        '-f',
        'f32le',
        '-',
      ],
      { maxBuffer: 16 * 1024 * 1024 }
    );
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
  });
}

describe.skipIf(!realAvailable)('real pinned model, real people (LibriSpeech dev-clean)', () => {
  it('real speech clears the sample route; the neural print takes its speaker and refuses another', async () => {
    await useModel(MODEL);
    const speakers = readdirSync(CORPUS)
      .filter((d) => statSync(join(CORPUS, d)).isDirectory())
      .sort();
    const [mine, theirs] = [utterances(speakers[0]!, 10), utterances(speakers[1]!, 1)];

    // The modal: record until 3 samples are taken. The route used to refuse
    // every one of these (403, liveness); some may still get a 400 from the
    // enrollment consistency check, which is a separate calibration question.
    expect((await call('/enroll/start', { requiredSamples: 3 })).status).toBe(200);
    const taken: Float32Array[] = [];
    const statuses: number[] = [];
    for (const clip of mine) {
      if (taken.length === 3) break;
      // eslint-disable-next-line no-await-in-loop -- sequential, like the modal
      expect((await checkLiveness(clip, RATE)).isLive).toBe(false);
      // eslint-disable-next-line no-await-in-loop
      const added = await call('/enroll/sample', { samples: Array.from(clip) });
      statuses.push(added.status);
      if (added.status === 200) taken.push(clip);
    }
    expect(statuses).not.toContain(403);
    expect(taken).toHaveLength(3);
    expect((await call('/enroll/complete', {})).status).toBe(200);

    const profile = await loadVoiceProfile(USER);
    expect(profile?.embeddingMethod).toBe('neural');
    expect((await verifyUser(taken[0] as Float32Array, profile!)).verified).toBe(true);
    expect((await verifyUser(theirs[0] as Float32Array, profile!)).verified).toBe(false);
  });
});
