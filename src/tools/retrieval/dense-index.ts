/**
 * Embedding index over the intent manual: which tools does a request need?
 *
 * Measured offline (scripts/tool-retrieval/RESULTS.md): on rambling spoken
 * requests Vertex text-embedding-005 finds the labelled tool in the top 10 for
 * 79% of requests and top 20 for 85% (BM25: 30% / 39%), ~91% / ~93% counting
 * near-duplicate tools that would do the job. The scoring here is the one
 * measured: a tool's score is the mean of its 3 best-matching example
 * requests plus 0.3 x the match on its name and description.
 *
 * The ~14k example vectors are embedded once per machine (~30 s, a few cents)
 * and cached on disk keyed by the manual's content, so job processes on the
 * same machine load them instead of rebuilding; a lock file keeps concurrent
 * processes from building at once.
 *
 * @module tools/retrieval/dense-index
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { createLogger } from '../../utils/safe-logger.js';
import type { IntentManual, RetrievedTool } from './tool-retriever.js';

const log = createLogger({ module: 'DenseToolIndex' });

export const EMBEDDING_MODEL = 'text-embedding-005';
const TOP_C = 3;
const SPEC_WEIGHT = 0.3;
const BUILD_BATCH = 100;
const BUILD_CONCURRENCY = 8;
const LOCK_WAIT_MS = 180_000;
/** A lock this old belongs to a process that died while building. */
const STALE_LOCK_MS = 300_000;

export interface Embedder {
  readonly model: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

function normalize(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (const x of Array.from(v)) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** Vertex embeddings, with the task type the offline evaluation used. */
export function createVertexEmbedder(
  project = process.env.GOOGLE_CLOUD_PROJECT,
  location = process.env.TOOL_RETRIEVAL_EMBED_LOCATION || 'us-central1'
): Embedder {
  const ai = new GoogleGenAI({ vertexai: true, project, location });
  return {
    model: EMBEDDING_MODEL,
    async embed(texts) {
      const r = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts.map((t) => t.slice(0, 1000)),
        config: { taskType: 'SEMANTIC_SIMILARITY' },
      });
      return (r.embeddings ?? []).map((e) => normalize(e.values ?? []));
    },
  };
}

/** The texts to embed: every example request, and each tool's name + description. */
export function indexTexts(
  manual: IntentManual
): Array<{ tool: string; kind: 'q' | 'spec'; text: string }> {
  const split = (n: string): string => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  const out: Array<{ tool: string; kind: 'q' | 'spec'; text: string }> = [];
  for (const [tool, e] of Object.entries(manual.tools)) {
    for (const q of e.queries) out.push({ tool, kind: 'q', text: q });
    out.push({ tool, kind: 'spec', text: `${split(tool)}: ${e.description}` });
  }
  return out;
}

export class DenseToolIndex {
  private readonly toolIds: Uint16Array;
  private readonly isSpec: Uint8Array;

  constructor(
    readonly tools: readonly string[],
    toolIds: ArrayLike<number>,
    isSpec: ArrayLike<number>,
    readonly vectors: Float32Array,
    readonly dim: number
  ) {
    this.toolIds = Uint16Array.from(toolIds);
    this.isSpec = Uint8Array.from(isSpec);
  }

  get size(): number {
    return this.toolIds.length;
  }

  /** The `k` best tools for a normalised query vector, best first. */
  search(query: Float32Array, k: number): RetrievedTool[] {
    const nTools = this.tools.length;
    // Best TOP_C example similarities per tool, kept sorted descending.
    const best = new Float32Array(nTools * TOP_C).fill(-Infinity);
    const spec = new Float32Array(nTools);
    const { vectors, dim } = this;
    for (let d = 0; d < this.toolIds.length; d++) {
      let s = 0;
      const base = d * dim;
      for (let j = 0; j < dim; j++) s += query[j] * vectors[base + j];
      const t = this.toolIds[d];
      if (this.isSpec[d]) {
        spec[t] = s;
        continue;
      }
      const o = t * TOP_C;
      if (s <= best[o + TOP_C - 1]) continue;
      let i = TOP_C - 1;
      while (i > 0 && best[o + i - 1] < s) {
        best[o + i] = best[o + i - 1];
        i--;
      }
      best[o + i] = s;
    }
    const scored: RetrievedTool[] = [];
    for (let t = 0; t < nTools; t++) {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < TOP_C; i++) {
        const v = best[t * TOP_C + i];
        if (v === -Infinity) break;
        sum += v;
        n++;
      }
      scored.push({ tool: this.tools[t], score: (n ? sum / n : 0) + SPEC_WEIGHT * spec[t] });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /** Embed the manual (in parallel batches) into an index. */
  static async build(manual: IntentManual, embedder: Embedder): Promise<DenseToolIndex> {
    const texts = indexTexts(manual);
    const tools = Object.keys(manual.tools);
    const toolIndex = new Map(tools.map((t, i) => [t, i]));
    const vecs: Float32Array[] = new Array(texts.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < texts.length) {
        const start = next;
        next += BUILD_BATCH;
        const batch = texts.slice(start, start + BUILD_BATCH).map((t) => t.text);
        for (let attempt = 0; ; attempt++) {
          try {
            (await embedder.embed(batch)).forEach((v, j) => (vecs[start + j] = v));
            break;
          } catch (error) {
            if (attempt >= 4) throw error;
            await new Promise((r) => {
              setTimeout(r, 1000 * (attempt + 1));
            });
          }
        }
      }
    };
    await Promise.all(Array.from({ length: BUILD_CONCURRENCY }, worker));
    const dim = vecs[0].length;
    const flat = new Float32Array(texts.length * dim);
    vecs.forEach((v, i) => flat.set(v, i * dim));
    return new DenseToolIndex(
      tools,
      texts.map((t) => toolIndex.get(t.tool)!),
      texts.map((t) => (t.kind === 'spec' ? 1 : 0)),
      flat,
      dim
    );
  }

  serialize(): Buffer {
    const header = Buffer.from(JSON.stringify({ tools: this.tools, dim: this.dim, n: this.size }));
    const len = Buffer.alloc(4);
    len.writeUInt32LE(header.length);
    return Buffer.concat([
      len,
      header,
      Buffer.from(this.toolIds.buffer),
      Buffer.from(this.isSpec.buffer),
      Buffer.from(this.vectors.buffer, this.vectors.byteOffset, this.vectors.byteLength),
    ]);
  }

  static deserialize(buf: Buffer): DenseToolIndex {
    const hlen = buf.readUInt32LE(0);
    const { tools, dim, n } = JSON.parse(buf.subarray(4, 4 + hlen).toString()) as {
      tools: string[];
      dim: number;
      n: number;
    };
    let o = 4 + hlen;
    const toolIds = new Uint16Array(
      buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + n * 2)
    );
    o += n * 2;
    const isSpec = new Uint8Array(buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + n));
    o += n;
    const vectors = new Float32Array(
      buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + n * dim * 4)
    );
    return new DenseToolIndex(tools, toolIds, isSpec, vectors, dim);
  }
}

export function loadIntentManual(): IntentManual {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(
    readFileSync(join(here, 'intent-manual.generated.json'), 'utf8')
  ) as IntentManual;
}

/** Cache file for a manual + model, so a changed manual never loads stale vectors. */
export function indexCachePath(manual: IntentManual, model: string, dir = tmpdir()): string {
  const hash = createHash('sha1')
    .update(model)
    .update(JSON.stringify(manual))
    .digest('hex')
    .slice(0, 12);
  return join(dir, `ferni-tool-index-${hash}.bin`);
}

/** Load the index from the disk cache, or build it (one process per machine builds). */
export async function loadOrBuildIndex(
  manual: IntentManual,
  embedder: Embedder,
  cachePath = indexCachePath(manual, embedder.model)
): Promise<DenseToolIndex> {
  const lock = `${cachePath}.lock`;
  const started = Date.now();
  while (Date.now() - started < LOCK_WAIT_MS) {
    if (existsSync(cachePath)) {
      const index = DenseToolIndex.deserialize(readFileSync(cachePath));
      log.info({ docs: index.size, ms: Date.now() - started }, 'tool index loaded from cache');
      return index;
    }
    let fd: number | null = null;
    try {
      fd = openSync(lock, 'wx');
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) unlinkSync(lock);
      } catch {
        // the lock went away between calls: fine
      }
      // another process is building
      await new Promise((r) => {
        setTimeout(r, 1000);
      });
      continue;
    }
    try {
      const index = await DenseToolIndex.build(manual, embedder);
      const tmp = `${cachePath}.${process.pid}.tmp`;
      writeFileSync(tmp, index.serialize());
      renameSync(tmp, cachePath);
      log.info({ docs: index.size, ms: Date.now() - started }, 'tool index built');
      return index;
    } finally {
      closeSync(fd);
      unlinkSync(lock);
    }
  }
  throw new Error('timed out waiting for another process to build the tool index');
}

let shared: Promise<DenseToolIndex> | null = null;

/** The process-wide index (built or loaded on first use). */
export function getSharedToolIndex(embedder: Embedder): Promise<DenseToolIndex> {
  shared ??= loadOrBuildIndex(loadIntentManual(), embedder).catch((error: unknown) => {
    shared = null; // retry on a later turn
    throw error;
  });
  return shared;
}
