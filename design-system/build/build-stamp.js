/**
 * Deterministic build stamp for generated token files.
 *
 * Generated outputs must be a pure function of the token sources, otherwise
 * every regeneration produces a diff and the content-based drift check
 * (check-drift.js) can't tell real drift from noise. So no wall-clock
 * timestamps: stamp outputs with the token version instead.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const VERSION_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../tokens/version.json');

/** e.g. "tokens v1.0.0" */
export function buildStamp() {
  const { version } = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8'));
  return `tokens v${version}`;
}
