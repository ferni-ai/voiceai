import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
    const { discoverAndLoadBundles } = await import('../../../personas/bundles/index.js');
    registry.resetVoiceRegistry();
    registry.getVoiceId('ferni'); // an early lookup registers the fallbacks
    await warmCallPath(() => undefined, []);
    for (const { manifest } of (await discoverAndLoadBundles()).bundles) {
      expect(registry.getVoiceId(manifest.identity.id), manifest.identity.id).toBe(
        manifest.voice.voice_id
      );
    }
  }, 60_000);
});
