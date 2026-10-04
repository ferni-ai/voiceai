/**
 * Point the speaker-embedding worker at a test model. The worker loads only a
 * file whose sha256 is SPEAKER_MODEL_SHA256 (default: the production model's),
 * so a fixture is pinned to its own digest here, the way the agent image pins
 * the real model.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Set SPEAKER_MODEL_PATH and pin the file's own sha256; undefined clears both. */
export function useSpeakerModel(path: string | undefined): void {
  if (path === undefined) {
    delete process.env.SPEAKER_MODEL_PATH;
    delete process.env.SPEAKER_MODEL_SHA256;
    return;
  }
  process.env.SPEAKER_MODEL_PATH = path;
  if (existsSync(path)) process.env.SPEAKER_MODEL_SHA256 = sha256Of(path);
  else delete process.env.SPEAKER_MODEL_SHA256;
}
