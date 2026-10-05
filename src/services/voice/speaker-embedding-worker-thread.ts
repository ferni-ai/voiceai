/**
 * Speaker-embedding worker thread.
 *
 * Owns the neural speaker model so inference never runs on the agent's main
 * event loop. onnxruntime-node's `session.run` executes synchronously on the
 * calling thread (it is only deferred with setImmediate), so running it here
 * keeps the 80-90 ms ECAPA-TDNN inference off the loop that carries audio.
 *
 * Model contract: an ONNX graph with input `waveform` [batch, samples] (16 kHz
 * mono, float32 in [-1, 1]) and output `embedding` [batch, 192], unit length.
 * The graph contains its own features (see scripts/speaker/export-ecapa-onnx.py),
 * so no front end is reimplemented here. If the model does not load or does
 * not meet that contract (e.g. the old mel-spectrogram-input model), or its
 * sha256 is not the pinned one, the worker reports why and the main thread
 * stops it and uses DSP features. The file is hashed here, before
 * onnxruntime sees it, so hashing 84 MB never blocks the main event loop.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parentPort, threadId, workerData } from 'node:worker_threads';
import type {
  SpeakerWorkerInit,
  SpeakerWorkerReply,
  SpeakerWorkerRequest,
} from './speaker-embedding-worker.js';

const EMBEDDING_DIM = 192;
const INPUT_NAME = 'waveform';
const OUTPUT_NAME = 'embedding';

interface OrtTensor {
  data: Float32Array;
}
interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
}
interface OrtModule {
  InferenceSession: {
    create: (path: string, options: Record<string, unknown>) => Promise<OrtSession>;
  };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
}

type Embedder = (audio: Float32Array) => Promise<Float32Array>;
interface LoadedModel {
  embed: Embedder;
  /** The digest the file was checked against (and matched). */
  sha256: string;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function loadNeural({ modelPath, expectedSha256 }: SpeakerWorkerInit): Promise<LoadedModel> {
  if (!existsSync(modelPath)) throw new Error(`no model file at ${modelPath}`);
  const actual = await sha256File(modelPath);
  if (actual !== expectedSha256) {
    throw new Error(`model sha256 ${actual} is not the pinned ${expectedSha256}; refusing it`);
  }
  const ort = createRequire(import.meta.url)('onnxruntime-node') as OrtModule;
  // One intra-op thread: the comparison runs every 2 s, so latency is not the
  // constraint; keeping CPU use to one core is (2-CPU dev instances).
  const session = await ort.InferenceSession.create(modelPath, {
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
    graphOptimizationLevel: 'all',
  });
  if (session.inputNames[0] !== INPUT_NAME || session.outputNames[0] !== OUTPUT_NAME) {
    throw new Error(
      `unsupported model contract: inputs [${session.inputNames.join(', ')}], ` +
        `outputs [${session.outputNames.join(', ')}]; expected ${INPUT_NAME} -> ${OUTPUT_NAME}`
    );
  }
  const embed: Embedder = async (audio) => {
    const out = await session.run({
      [INPUT_NAME]: new ort.Tensor('float32', audio, [1, audio.length]),
    });
    return Float32Array.from(out[OUTPUT_NAME].data);
  };
  // Smoke run: a model that loads but emits the wrong shape is not usable.
  const tone = new Float32Array(16000).map(
    (_, i) => 0.01 * Math.sin((2 * Math.PI * 200 * i) / 16000)
  );
  const probe = await embed(tone);
  if (probe.length !== EMBEDDING_DIM || !probe.every(Number.isFinite)) {
    throw new Error(`model returned ${probe.length} values, expected ${EMBEDDING_DIM} finite`);
  }
  return { embed, sha256: actual };
}

async function main(): Promise<void> {
  const port = parentPort;
  if (!port) return;
  const init = workerData as SpeakerWorkerInit;
  const reply = (msg: SpeakerWorkerReply, transfer: ArrayBuffer[] = []): void =>
    port.postMessage(msg, transfer);

  let neural: LoadedModel;
  try {
    neural = await loadNeural(init);
  } catch (error) {
    // The main thread logs this, stops the worker and uses DSP itself.
    const reason = error instanceof Error ? error.message : String(error);
    reply({ type: 'ready', method: 'dsp', reason, threadId });
    return;
  }
  reply({ type: 'ready', method: 'neural', sha256: neural.sha256, threadId });

  port.on('message', (req: SpeakerWorkerRequest) => {
    void (async () => {
      try {
        const started = performance.now();
        const vector = await neural.embed(req.samples);
        const inferMs = performance.now() - started;
        reply({ type: 'result', id: req.id, vector, method: 'neural', inferMs, threadId }, [
          vector.buffer as ArrayBuffer,
        ]);
      } catch (error) {
        reply({
          type: 'error',
          id: req.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });
}

void main();
