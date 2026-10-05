/**
 * The voice agent must load exactly one onnxruntime-node.
 *
 * Silero VAD (@livekit/agents-plugin-silero) and @huggingface/transformers each
 * pin an exact onnxruntime-node. On Linux every copy's native binding links
 * against libonnxruntime.so.1, and whichever copy loads first wins. Silero loads
 * at VAD prewarm, so a newer transformers binding then fails with
 * "version `VERS_1.30.0' not found". package.json overrides Silero's copy to
 * match transformers; this fails if a bump to either package splits them again.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

/** The onnxruntime-node version a package resolves from its own install directory. */
function onnxruntimeVersionFor(pkg: string): string {
  const pkgDir = realpathSync(join(ROOT, 'node_modules', pkg));
  // pnpm installs a package's dependencies beside it under .pnpm/<id>/node_modules.
  const ortPkg = join(pkgDir, '..', pkg.startsWith('@') ? '..' : '', 'onnxruntime-node', 'package.json');
  return JSON.parse(readFileSync(ortPkg, 'utf8')).version;
}

describe('onnxruntime-node', () => {
  it('is the same version for Silero VAD and transformers', () => {
    const silero = onnxruntimeVersionFor('@livekit/agents-plugin-silero');
    const transformers = onnxruntimeVersionFor('@huggingface/transformers');
    expect(silero).toMatch(/^\d+\.\d+\.\d+/);
    expect(silero).toBe(transformers);
  });
});
