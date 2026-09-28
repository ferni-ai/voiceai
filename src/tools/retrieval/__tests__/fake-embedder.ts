import type { Embedder } from '../dense-index.js';

/** Bag-of-words vectors: similar wording, similar vector. */
export function fakeEmbedder(dim = 64): Embedder & { calls: number } {
  const e = {
    model: 'fake',
    calls: 0,
    async embed(texts: string[]) {
      e.calls++;
      return texts.map((t) => {
        const v = new Float32Array(dim);
        for (const w of t.toLowerCase().match(/[a-z]+/g) ?? []) {
          let h = 0;
          for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
          v[h % dim] += 1;
        }
        const n = Math.hypot(...v) || 1;
        return v.map((x) => x / n);
      });
    },
  };
  return e;
}
