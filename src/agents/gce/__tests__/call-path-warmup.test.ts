import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// A voice no fallback uses, so the test can tell bundle voices from fallbacks
const BUNDLE_VOICE = 'bundle-only-voice-0000-0000-000000000000';
vi.mock('../../../personas/bundles/index.js', () => ({
  discoverAndLoadBundles: async () => ({
    personas: [],
    errors: [],
    bundles: [
      {
        manifest: {
          identity: { id: 'jordan-taylor', name: 'Jordan' },
          voice: { voice_id: BUNDLE_VOICE, provider: 'cartesia' },
        },
      },
    ],
  }),
}));

import {
  CALL_PATH,
  TURN_PATH,
  WARM_PATH,
  dynamicImportSpecifiers,
  quietProcessReport,
} from '../call-path-warmup.js';

describe('dynamicImportSpecifiers', () => {
  it('finds string-literal dynamic imports once each, relative and bare', () => {
    const src = `
      const a = await import('../shared/reply-gap.js');
      void import("@livekit/rtc-node").then(() => {});
      const again = await import( '../shared/reply-gap.js' );
      import { x } from './static.js';
      const dyn = await import(name);
      const tpl = await import(\`./\${n}.js\`);
    `;
    expect(dynamicImportSpecifiers(src)).toEqual(['../shared/reply-gap.js', '@livekit/rtc-node']);
  });
});

describe('CALL_PATH', () => {
  it('names modules that exist, so the warm-up does not silently shrink', () => {
    for (const file of CALL_PATH) {
      expect(existsSync(fileURLToPath(new URL(`../${file}.ts`, import.meta.url))), file).toBe(true);
    }
  });
});

describe('TURN_PATH', () => {
  it('names modules that exist, so the warm-up does not silently shrink', () => {
    for (const file of TURN_PATH) {
      expect(existsSync(fileURLToPath(new URL(`../${file}.ts`, import.meta.url))), file).toBe(true);
    }
  });

  it('is warmed by default with the call path', () => {
    expect(WARM_PATH).toEqual([...CALL_PATH, ...TURN_PATH]);
  });
});

describe('warmCallPath and the first turn', () => {
  /** What warmCallPath asked to load, with a recorder in place of import(). */
  async function warmedTargets(): Promise<Set<string>> {
    const { warmCallPath } = await import('../call-path-warmup.js');
    const loaded = new Set<string>();
    await warmCallPath(
      () => undefined,
      undefined,
      async (target) => {
        loaded.add(target);
      }
    );
    return loaded;
  }
  const src = (path: string): string => new URL(`../../../${path}`, import.meta.url).href;

  // Measured, not derived from TURN_PATH: a warmed child's first turn loaded
  // these cold (2026-10-21 local harness: processTurn alone loaded 88 modules
  // on turn 1 and none after). The identity step and the behavioral builder
  // were its two longest blocks.
  const COLD_ON_FIRST_TURN = [
    src('services/trust-and-identity/voice-agent-integration.js'),
    src('intelligence/context-builders/behavioral/integration.js'),
    src('memory/knowledge-graph/index.js'),
    src('services/health/index.js'),
    src('services/visual-memory/index.js'),
    src('services/ambient-mode/index.js'),
    src('services/cognitive-intelligence/index.js'),
    src('services/wellbeing-tracking/index.js'),
    '@google-cloud/vertexai',
  ];

  it('loads, before any call, what a cold first turn was measured loading', async () => {
    const loaded = await warmedTargets();
    expect(COLD_ON_FIRST_TURN.filter((target) => !loaded.has(target))).toEqual([]);
  });

  it('loads every lazy import of processTurn and its context builders', async () => {
    const loaded = await warmedTargets();
    const files = [
      // turn-intelligence.ts's own steps before the build, then the turn handler's
      'agents/multi-agent/turn-intelligence.ts',
      'agents/voice-agent/turn-handler.ts',
      'agents/processors/turn-processor/process-turn.ts',
      'agents/processors/turn-processor/context-injections.ts',
      'agents/processors/cached-modules.ts',
    ];
    const missing: string[] = [];
    for (const file of files) {
      const url = new URL(src(file));
      for (const spec of dynamicImportSpecifiers(readFileSync(url, 'utf8'))) {
        const target = spec.startsWith('.') ? new URL(spec, url).href : spec;
        if (!loaded.has(target)) missing.push(`${file}: ${spec}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('quietProcessReport', () => {
  it('turns off the report network section the napi loaders pay for', () => {
    const report = process.report as unknown as { excludeNetwork: boolean };
    report.excludeNetwork = false;
    quietProcessReport();
    expect(report.excludeNetwork).toBe(true);
  });
});

describe('warmCallPath', () => {
  it('loads the bundle voices, so a call never starts on the fallbacks', async () => {
    const { warmCallPath } = await import('../call-path-warmup.js');
    const registry = await import('../../../personas/voice-registry.js');
    registry.resetVoiceRegistry();
    expect(registry.getVoiceId('jordan-taylor')).not.toBe(BUNDLE_VOICE); // fallbacks registered
    await warmCallPath(() => undefined, []);
    expect(registry.getVoiceId('jordan-taylor')).toBe(BUNDLE_VOICE);
  });

  it('builds the Vertex client, which the first turn otherwise builds mid-reply', async () => {
    vi.resetModules();
    const warmVertexClient = vi.fn(async () => true);
    vi.doMock('../../../services/llm-utils.js', () => ({ warmVertexClient }));
    try {
      const { warmCallPath } = await import('../call-path-warmup.js');
      await warmCallPath(() => undefined, []);
      expect(warmVertexClient).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock('../../../services/llm-utils.js');
      vi.resetModules();
    }
  });

  it('never throws when the voice registry fails to load', async () => {
    vi.resetModules();
    vi.doMock('../../../personas/voice-registry.js', () => ({
      initializeVoiceRegistry: async () => {
        throw new Error('registry down');
      },
    }));
    try {
      const { warmCallPath } = await import('../call-path-warmup.js');
      const result = await warmCallPath(() => undefined, []);
      expect(result.failed).toBeGreaterThanOrEqual(1);
    } finally {
      vi.doUnmock('../../../personas/voice-registry.js');
      vi.resetModules();
    }
  });
});
