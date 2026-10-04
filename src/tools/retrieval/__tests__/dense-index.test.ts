import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DenseToolIndex, loadOrBuildIndex, indexCachePath } from '../dense-index.js';
import { fakeEmbedder } from './fake-embedder.js';
import type { IntentManual } from '../tool-retriever.js';

const manual: IntentManual = {
  tools: {
    setTimer: {
      domain: 'simple-utilities',
      description: 'countdown timer',
      queries: ['set a timer for ten minutes', 'keep track of the pasta'],
    },
    playMusic: {
      domain: 'entertainment',
      description: 'play songs',
      queries: ['put on some jazz', 'play upbeat songs'],
    },
    getWeather: {
      domain: 'information',
      description: 'weather forecast',
      queries: ['will it rain today', 'do I need an umbrella'],
    },
  },
};

describe('DenseToolIndex', () => {
  it('ranks the tool whose example requests match best', async () => {
    const embedder = fakeEmbedder();
    const index = await DenseToolIndex.build(manual, embedder);
    const [q] = await embedder.embed(['put some jazz on please']);
    expect(index.search(q, 1)[0].tool).toBe('playMusic');
    const [r] = await embedder.embed(['is it going to rain']);
    expect(index.search(r, 3).map((t) => t.tool)[0]).toBe('getWeather');
  });

  it('round-trips through serialize and deserialize', async () => {
    const embedder = fakeEmbedder();
    const index = await DenseToolIndex.build(manual, embedder);
    const copy = DenseToolIndex.deserialize(index.serialize());
    const [q] = await embedder.embed(['keep track of the pasta']);
    expect(copy.search(q, 3)).toEqual(index.search(q, 3));
  });

  it('builds once, then loads from the disk cache', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tool-index-'));
    const embedder = fakeEmbedder();
    const path = indexCachePath(manual, embedder.model, dir);
    await loadOrBuildIndex(manual, embedder, path);
    const builds = embedder.calls;
    expect(existsSync(path)).toBe(true);
    const again = await loadOrBuildIndex(manual, embedder, path);
    expect(embedder.calls).toBe(builds);
    expect(again.size).toBe(9);
  });
});
