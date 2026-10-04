/**
 * The real speaker-embedding worker thread, through the production extractor
 * (extractSpeakerEmbedding). Only the logger is replaced, to count log lines.
 *
 * Fixtures (scripts/speaker/make-test-models.py):
 * - waveform-contract.onnx: embedding = first 192 samples, unit length. DSP
 *   cannot produce that vector, so seeing it proves the neural path ran.
 * - mel-contract.onnx: the old ferni-speaker input; must be refused.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { ...logged, child: () => logger };
  return { createLogger: () => logger, getLogger: () => logger, default: () => logger };
});

import { extractSpeakerEmbedding } from '../../voice-memory-enhanced.js';
import { extractDSPFeatures } from '../speaker-dsp-features.js';
import {
  embedOffMainThread,
  getSpeakerEmbeddingMethod,
  PINNED_SPEAKER_MODEL_SHA256,
  resetSpeakerEmbeddingWorker,
} from '../speaker-embedding-worker.js';
import { sha256Of, useSpeakerModel } from './speaker-model-fixture.js';

const FIXTURES = join(__dirname, 'fixtures');
const WAVEFORM = join(FIXTURES, 'waveform-contract.onnx');

/** 1 s of a voice-like tone with a ramp so the first 192 samples are distinctive. */
function voice(seconds = 1): Float32Array {
  const a = new Float32Array(16000 * seconds);
  for (let i = 0; i < a.length; i++)
    a[i] = 0.3 * Math.sin((2 * Math.PI * 140 * i) / 16000) + i * 1e-5;
  return a;
}

function unitHead(a: Float32Array): number[] {
  const head = Array.from(a.slice(0, 192));
  const n = Math.hypot(...head);
  return head.map((v) => v / n);
}

const useModel = useSpeakerModel;

const warnings = (): string[] => logged.warn.mock.calls.map((c) => JSON.stringify(c));

afterEach(async () => {
  await resetSpeakerEmbeddingWorker();
  useModel(undefined);
  vi.clearAllMocks();
});

describe('speaker embedding worker', () => {
  it('selects the neural model when SPEAKER_MODEL_PATH names one, and runs it off the main thread', async () => {
    useModel(join(FIXTURES, 'waveform-contract.onnx'));
    const audio = voice();

    const emb = await extractSpeakerEmbedding(audio);

    expect(emb?.method).toBe('neural');
    expect(emb?.confidence).toBe(0.95);
    const expected = unitHead(audio);
    Array.from(emb?.vector ?? []).forEach((v, i) => expect(v).toBeCloseTo(expected[i], 5));

    const direct = await embedOffMainThread(audio);
    expect(direct.threadId).not.toBe(0); // the main thread's threadId is 0
    const backendLines = (fn: typeof logged.info): number =>
      fn.mock.calls.filter((c) => JSON.stringify(c).includes('Speaker embeddings:')).length;
    expect(backendLines(logged.info)).toBe(1);
    expect(backendLines(logged.warn)).toBe(0);
  });

  it('leaves the caller’s samples intact (they are copied, not transferred)', async () => {
    useModel(join(FIXTURES, 'waveform-contract.onnx'));
    const audio = voice();
    await extractSpeakerEmbedding(audio);
    expect(audio.length).toBe(16000);
    expect(audio[100]).toBeCloseTo(0.3 * Math.sin((2 * Math.PI * 140 * 100) / 16000) + 1e-3, 6);
  });

  it('falls back to DSP with one log line when the model file is missing', async () => {
    useModel(join(FIXTURES, 'does-not-exist.onnx'));
    const audio = voice();

    const first = await extractSpeakerEmbedding(audio);
    const second = await extractSpeakerEmbedding(audio);

    expect(first?.method).toBe('dsp');
    expect(second?.method).toBe('dsp');
    expect(Array.from(first?.vector ?? [])).toEqual(Array.from(extractDSPFeatures(audio)));
    const warnings = logged.warn.mock.calls.map((c) => JSON.stringify(c));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('no model file');
    // no worker was started for DSP
    await expect(embedOffMainThread(audio)).rejects.toThrow('no neural speaker model');
  });

  it('refuses a mel-spectrogram model (the old ferni-speaker contract) and uses DSP', async () => {
    useModel(join(FIXTURES, 'mel-contract.onnx'));

    expect(await getSpeakerEmbeddingMethod()).toBe('dsp');
    expect(JSON.stringify(logged.warn.mock.calls[0])).toContain('unsupported model contract');
    expect((await extractSpeakerEmbedding(voice()))?.method).toBe('dsp');
    // the worker that refused the model was stopped
    await expect(embedOffMainThread(voice())).rejects.toThrow('no neural speaker model');
  });

  it('uses DSP when no model is configured', async () => {
    useModel(undefined);
    expect(await getSpeakerEmbeddingMethod()).toBe('dsp');
    expect(JSON.stringify(logged.warn.mock.calls[0])).toContain('SPEAKER_MODEL_PATH is not set');
  });

  it('still returns null for audio shorter than 0.5 s', async () => {
    useModel(join(FIXTURES, 'waveform-contract.onnx'));
    expect(await extractSpeakerEmbedding(new Float32Array(7999))).toBeNull();
  });

  it('refuses a model whose sha256 is not the pinned one, with one log line, and uses DSP', async () => {
    useModel(WAVEFORM);
    process.env.SPEAKER_MODEL_SHA256 = sha256Of(join(FIXTURES, 'mel-contract.onnx'));

    expect(await getSpeakerEmbeddingMethod()).toBe('dsp');
    expect((await extractSpeakerEmbedding(voice()))?.method).toBe('dsp');
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain(`model sha256 ${sha256Of(WAVEFORM)} is not the pinned`);
    await expect(embedOffMainThread(voice())).rejects.toThrow('no neural speaker model');
  });

  it('pins the production model when SPEAKER_MODEL_SHA256 is unset', async () => {
    useModel(WAVEFORM);
    delete process.env.SPEAKER_MODEL_SHA256;

    expect(await getSpeakerEmbeddingMethod()).toBe('dsp');
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain(`is not the pinned ${PINNED_SPEAKER_MODEL_SHA256}`);
  });

  it('refuses a SPEAKER_MODEL_SHA256 that is not a sha256', async () => {
    useModel(WAVEFORM);
    process.env.SPEAKER_MODEL_SHA256 = 'latest';

    expect(await getSpeakerEmbeddingMethod()).toBe('dsp');
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('SPEAKER_MODEL_SHA256 is not a sha256');
  });

  it('the agent image downloads and checks the model the worker pins', () => {
    const dockerfile = readFileSync(join(__dirname, '../../../../docker/Dockerfile.agent'), 'utf8');
    const sha = PINNED_SPEAKER_MODEL_SHA256;
    expect(dockerfile).toContain(`ARG SPEAKER_MODEL_SHA256=${sha}`);
    expect(dockerfile).toContain(
      `ARG SPEAKER_MODEL_URL=https://storage.googleapis.com/ferni-public-models/speaker/ecapa-tdnn-waveform-${sha.slice(0, 8)}.onnx`
    );
    expect(dockerfile).toContain('sha256sum -c /models/speaker/ecapa-tdnn-waveform.onnx.sha256');
    expect(dockerfile).toMatch(
      /ENV SPEAKER_MODEL_PATH=\/models\/speaker\/ecapa-tdnn-waveform\.onnx/
    );
  });
});
