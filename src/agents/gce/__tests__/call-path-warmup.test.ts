import { existsSync } from 'node:fs';
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

import { CALL_PATH, dynamicImportSpecifiers, quietProcessReport } from '../call-path-warmup.js';

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
