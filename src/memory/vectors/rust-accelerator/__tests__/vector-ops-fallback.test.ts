/**
 * Semantic tool routing and memory search call these on live turns. Without
 * @ferni/perf (or with DISABLE_RUST_ACCELERATOR=true) they used to throw with
 * no fallback, which broke routing; now they fall back to JavaScript, and the
 * results must match the native ones.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  batchCosineSimilarityOptimized,
  batchNormalizeVectorsF32,
  computeCentroidF32,
  findSimilarPairs,
  normalizeVectorF32,
  topKSimilar,
  vectorNormF32,
} from '../vector-ops.js';
import { isRustAvailable } from '../core.js';

const DIM = 1536;
let seed = 3;
const rand = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
const vec = (): number[] => Array.from({ length: DIM }, rand);
const query = vec();
const cands = Array.from({ length: 8 }, vec); // >= 5: the native SIMD paths
cands.push(cands[0].map((x) => x * 0.98 + 0.001)); // a near-duplicate pair
const flat = Float32Array.from(cands.flat());

function all() {
  return {
    cosine: batchCosineSimilarityOptimized(query, cands),
    topK: topKSimilar(query, cands, 3),
    pairs: findSimilarPairs(cands, 0.9),
    norm: vectorNormF32(Float32Array.from(query)),
    normalized: Array.from(normalizeVectorF32(Float32Array.from(query))),
    batchNormalized: Array.from(batchNormalizeVectorsF32(flat, cands.length)),
    centroid: Array.from(computeCentroidF32(flat, cands.length)),
  };
}

const closeAll = (a: number[], b: number[]): void => {
  expect(a).toHaveLength(b.length);
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 4));
};

describe('rust-accelerator vector ops without the native module', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('fall back to JavaScript instead of throwing', () => {
    vi.stubEnv('DISABLE_RUST_ACCELERATOR', 'true');
    expect(() => all()).not.toThrow();
    const js = all();
    expect(js.pairs.map((p) => [p.firstIdx, p.secondIdx])).toEqual([[0, 8]]);
    expect(js.topK.indices).toHaveLength(3);
  });

  it.runIf(isRustAvailable())('give the same results as the native module', () => {
    const native = all();
    vi.stubEnv('DISABLE_RUST_ACCELERATOR', 'true');
    const js = all();
    closeAll(js.cosine, native.cosine);
    expect(js.topK.indices).toEqual(native.topK.indices);
    closeAll(js.topK.similarities, native.topK.similarities);
    expect(js.pairs.map((p) => [p.firstIdx, p.secondIdx])).toEqual(
      native.pairs.map((p) => [p.firstIdx, p.secondIdx])
    );
    expect(js.norm).toBeCloseTo(native.norm, 3);
    closeAll(js.normalized, native.normalized);
    closeAll(js.batchNormalized, native.batchNormalized);
    closeAll(js.centroid, native.centroid);
  });
});
