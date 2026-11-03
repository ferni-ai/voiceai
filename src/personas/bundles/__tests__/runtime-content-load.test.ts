/**
 * One bundle content file that fails to load costs only its own content.
 *
 * BundleRuntimeEngine.initialize() loads nine content types in one Promise.all.
 * A rejection used to fail all nine: createBundleRuntime threw, the voice agent
 * logged it as "non-fatal" and ran the persona with no bundle runtime, and a
 * stray timer logged a false "Content load timed out" five seconds later. That
 * was alex-chen and jordan-taylor in prod (a missing `]` in _story-graph.json).
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLogger } from '../../../utils/safe-logger.js';
import { loadBundle } from '../loader.js';
import { BundleRuntimeEngine } from '../runtime.js';

const sourceBundle = join(dirname(fileURLToPath(import.meta.url)), '..', 'alex-chen');
const storyGraphFile = join('content', 'stories', '_story-graph.json');

// The nine content types initialize() loads (private fields on the engine).
const CONTENT = [
  'voiceExpressions',
  'situationalResponses',
  'relationshipStages',
  'memoryPatterns',
  'personaModes',
  'storyGraph',
  'microExpressions',
  'contextualNuances',
  'conflictHandling',
] as const;

function loadedContent(engine: BundleRuntimeEngine): string[] {
  const fields = engine as unknown as Record<(typeof CONTENT)[number], unknown>;
  return CONTENT.filter((name) => fields[name] != null);
}

describe('BundleRuntimeEngine.initialize with a content file that fails to load', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let dir: string;

  beforeAll(async () => {
    // initialize() imports this; load it before timers are faked.
    await import('../../../conversation/index.js');
  });

  beforeEach(async () => {
    vi.mocked(getLogger).mockReturnValue(logger as unknown as ReturnType<typeof getLogger>);
    dir = await mkdtemp(join(tmpdir(), 'bundle-content-load-'));
    await cp(sourceBundle, dir, { recursive: true });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.mocked(getLogger).mockReset();
    for (const fn of Object.values(logger)) fn.mockReset();
    await rm(dir, { recursive: true, force: true });
  });

  async function initialized(): Promise<BundleRuntimeEngine> {
    const bundle = await loadBundle(dir, { forceReload: true });
    const engine = new BundleRuntimeEngine(bundle);
    await engine.initialize();
    return engine;
  }

  it('loads all nine content types from the intact bundle', async () => {
    const engine = await initialized();

    expect(loadedContent(engine)).toEqual([...CONTENT]);
    expect(engine.getStoryIntroPhrase()).toEqual(expect.any(String));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('drops only the broken story graph, logs it with the file, and the other eight load', async () => {
    const graph = join(dir, storyGraphFile);
    const text = await readFile(graph, 'utf8');
    await writeFile(graph, text.replace(/\]\s*\}\s*\}\s*$/, '}}'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const engine = await initialized();

    expect(loadedContent(engine)).toEqual(CONTENT.filter((name) => name !== 'storyGraph'));
    expect(engine.getStoryIntroPhrase()).toBeNull();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        personaId: 'alex-chen',
        operation: 'storyGraph',
        file: graph,
        error: expect.stringContaining(graph),
      }),
      'Content failed to load; continuing without it'
    );

    // The timeout timer was cleared, so no false "timed out" follows.
    vi.advanceTimersByTime(10_000);
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'storyGraph' }),
      'Content load timed out'
    );
  });
});
