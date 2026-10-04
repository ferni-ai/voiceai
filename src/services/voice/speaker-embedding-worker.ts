/**
 * Neural speaker embeddings off the main thread.
 *
 * When SPEAKER_MODEL_PATH names an ONNX model with the `waveform -> embedding`
 * contract, one worker thread per process loads it
 * (speaker-embedding-worker-thread.ts) and callers post 16 kHz audio to it.
 * Neural inference therefore never runs on the event loop that carries call
 * audio: since PR #246 the agent reports itself full when event-loop
 * utilization passes 0.7, and an 80-90 ms synchronous inference every 2 s
 * would eat into that.
 *
 * Without a usable model there is no worker (it would cost ~40 MB of RSS to
 * compute features that are cheap inline): the method is 'dsp' and callers
 * compute DSP features themselves. Exactly one log line says which method is
 * in use, and why.
 *
 * The worker loads only a file whose sha256 is the pinned one
 * (SPEAKER_MODEL_SHA256, default PINNED_SPEAKER_MODEL_SHA256): a truncated
 * download, a swapped object or a stale cache must not decide who a voice is.
 * Kill switch: unset SPEAKER_MODEL_PATH and every embedding is DSP.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { voiceHumanizationFlags } from '../../config/voice-humanization-flags.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SpeakerEmbeddingWorker' });

export type SpeakerEmbeddingMethod = 'neural' | 'dsp';

/**
 * sha256 of scripts/speaker/export-ecapa-onnx.py's output (84,131,064 bytes),
 * the file docker/Dockerfile.agent downloads. Change both together.
 */
export const PINNED_SPEAKER_MODEL_SHA256 =
  '93ccd596285b31d5debad84ab3f138d5dc1145f19c3f287b81ece65afa034fc9';

/** workerData for the thread. */
export interface SpeakerWorkerInit {
  modelPath: string;
  /** Lowercase hex; the worker refuses a file with any other digest. */
  expectedSha256: string;
}
export interface SpeakerWorkerRequest {
  id: number;
  samples: Float32Array;
}
export type SpeakerWorkerReply =
  | { type: 'ready'; method: SpeakerEmbeddingMethod; reason?: string; threadId: number }
  | { type: 'result'; id: number; vector: Float32Array; method: 'neural'; threadId: number }
  | { type: 'error'; id: number; message: string };

export interface OffThreadEmbedding {
  vector: Float32Array;
  method: 'neural';
  /** worker_threads threadId that computed it (the main thread is 0). */
  threadId: number;
}

/** A request that takes longer than this is abandoned (the caller falls back). */
const REQUEST_TIMEOUT_MS = 10_000;

interface Pending {
  resolve: (e: OffThreadEmbedding) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

let worker: Worker | null = null;
let method: Promise<SpeakerEmbeddingMethod> | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();

/**
 * Built: the compiled .js next to this file. From source (tsx, vitest): a
 * bootstrap that registers tsx inside the worker, then imports the .ts.
 * (`execArgv: ['--import', 'tsx']` does not reach the worker's own imports, so
 * its `./x.js` specifiers would not map to `.ts`.)
 */
function workerEntry(): string | URL {
  const dir = dirname(fileURLToPath(import.meta.url));
  const ts = join(dir, 'speaker-embedding-worker-thread.ts');
  if (!existsSync(ts)) return join(dir, 'speaker-embedding-worker-thread.js');
  const tsxApi = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href;
  const code =
    `import { register } from ${JSON.stringify(tsxApi)}; register();` +
    `await import(${JSON.stringify(pathToFileURL(ts).href)});`;
  return new URL(`data:text/javascript,${encodeURIComponent(code)}`);
}

function failAll(error: Error): void {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(error);
    pending.delete(id);
  }
}

function useDsp(reason: string): SpeakerEmbeddingMethod {
  log.warn({ reason }, 'Speaker embeddings: DSP voice features (no neural model)');
  return 'dsp';
}

/** Why the neural model cannot be used, checked without starting a worker. */
function unavailableReason(modelPath: string | undefined): string | null {
  if (!voiceHumanizationFlags.enableEnhancedVoiceFingerprinting) {
    return 'disabled by enableEnhancedVoiceFingerprinting';
  }
  if (!modelPath) return 'SPEAKER_MODEL_PATH is not set';
  if (!existsSync(modelPath)) return `no model file at ${modelPath}`;
  if (!/^[0-9a-f]{64}$/.test(expectedSha256())) return 'SPEAKER_MODEL_SHA256 is not a sha256';
  return null;
}

function expectedSha256(): string {
  return (process.env.SPEAKER_MODEL_SHA256 ?? PINNED_SPEAKER_MODEL_SHA256).trim().toLowerCase();
}

async function start(): Promise<SpeakerEmbeddingMethod> {
  const modelPath = process.env.SPEAKER_MODEL_PATH;
  const reason = unavailableReason(modelPath);
  if (reason || !modelPath) return useDsp(reason ?? 'no model');

  let w: Worker;
  try {
    const init: SpeakerWorkerInit = { modelPath, expectedSha256: expectedSha256() };
    w = new Worker(workerEntry(), { workerData: init });
  } catch (error) {
    return useDsp(`worker failed to start: ${String(error)}`);
  }
  w.unref(); // never keeps the process alive
  worker = w;

  return new Promise<SpeakerEmbeddingMethod>((resolve) => {
    let settled = false;
    const stop = (why: string): void => {
      if (worker === w) worker = null;
      failAll(new Error(why));
      void w.terminate();
    };
    w.on('message', (msg: SpeakerWorkerReply) => {
      if (msg.type === 'ready') {
        settled = true;
        if (msg.method === 'neural') {
          log.info({ modelPath }, 'Speaker embeddings: neural model in a worker thread');
          resolve('neural');
        } else {
          stop('model refused');
          resolve(useDsp(msg.reason ?? 'model refused'));
        }
        return;
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.type === 'result') {
        p.resolve({ vector: msg.vector, method: msg.method, threadId: msg.threadId });
      } else {
        p.reject(new Error(msg.message));
      }
    });
    const died = (error: Error): void => {
      if (worker !== w) return; // already stopped on purpose
      stop(error.message);
      if (!settled) {
        settled = true;
        resolve(useDsp(error.message));
      } else {
        log.warn({ error: error.message }, 'Speaker embedding worker stopped; using DSP');
        method = Promise.resolve('dsp');
      }
    };
    w.on('error', died);
    w.on('exit', (code) => died(new Error(`speaker embedding worker exited (code ${code})`)));
  });
}

/** 'neural' when the worker has the model loaded, else 'dsp'. Never rejects. */
export async function getSpeakerEmbeddingMethod(): Promise<SpeakerEmbeddingMethod> {
  method ??= start();
  return method;
}

/**
 * Embed 16 kHz mono audio with the neural model in the worker. The samples are
 * copied, so the caller's buffer stays usable. Rejects when there is no neural
 * model or the request fails or times out; callers fall back to DSP.
 */
export async function embedOffMainThread(samples: Float32Array): Promise<OffThreadEmbedding> {
  const w = (await getSpeakerEmbeddingMethod()) === 'neural' ? worker : null;
  if (!w) throw new Error('no neural speaker model');
  const id = nextId++;
  const copy = Float32Array.from(samples);
  return new Promise<OffThreadEmbedding>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`speaker embedding timed out after ${REQUEST_TIMEOUT_MS} ms`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    const req: SpeakerWorkerRequest = { id, samples: copy };
    w.postMessage(req, [copy.buffer as ArrayBuffer]);
  });
}

/** Stop the worker and forget its state (tests; a later call starts afresh). */
export async function resetSpeakerEmbeddingWorker(): Promise<void> {
  const w = worker;
  worker = null;
  method = null;
  failAll(new Error('speaker embedding worker reset'));
  if (w) await w.terminate();
}
