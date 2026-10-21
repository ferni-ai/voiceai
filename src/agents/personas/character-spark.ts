/**
 * The character sheet as PROMPT_MODE=character gives it to the model:
 * identity/character.md, then the persona's spark (PERSONA_SPARK=on), then
 * its own-life sheet (persona-slip-guard.ts). Used by prompt-loader.ts.
 *
 * PERSONA_SPARK=on (off by default): identity/character-spark.md rides right
 * after the sheet, when the bundle has one. Every sheet carried the same
 * "glad the way a friend is, not a cheerleader" and "you don't sound excited
 * to be here", and Cartesia honours an emotion only when the words carry it,
 * so no voice lever could make anyone sound joyful (persona-range report,
 * 2026-10-17). The spark file says how this one persona laughs, lights up and
 * comforts; where it and the sheet disagree on tone, it wins, and it says so
 * itself. Off, the sheet is exactly as it was.
 *
 * @module agents/personas/character-spark
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flagOn, type Env } from '../../config/env-flag.js';
import { withOwnLife } from '../../personas/persona-slip-guard.js';

export const CHARACTER_FILE = 'identity/character.md';
export const SPARK_FILE = 'identity/character-spark.md';

/**
 * Bundles whose character sheet came with PERSONA_SPARK: the three legends had
 * only legacy system prompts, two with "Things You DO Say" lines the model
 * repeats. Off, they keep the legacy prompt, so a legend call doesn't change
 * until the flag flips.
 */
export const SHEET_WITH_SPARK: ReadonlySet<string> = new Set([
  'joel-dickson',
  'peter-lynch',
  'john-bogle',
]);

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '../../personas/bundles');

async function read(bundleDir: string, file: string): Promise<string | null> {
  return readFile(join(BUNDLES, bundleDir, file), 'utf8').catch(() => null);
}

/** A bundle file as text, or null (director-cast.ts reads the sheet and manifest with it). */
export { read as readBundleFile };

/** The sheet with the bundle's spark after it, when PERSONA_SPARK is on and it has one. */
export async function withSpark(
  sheet: string | null,
  bundleDir: string,
  env: Env = process.env
): Promise<string | null> {
  if (!sheet || !flagOn('PERSONA_SPARK', env)) return sheet;
  const spark = await read(bundleDir, SPARK_FILE);
  return spark ? `${sheet.trimEnd()}\n\n${spark.trim()}\n` : sheet;
}

/** The bundle's character sheet (+ spark, + own life), or null when it has none. */
export async function characterSheet(
  bundleDir: string,
  env: Env = process.env
): Promise<string | null> {
  if (SHEET_WITH_SPARK.has(bundleDir) && !flagOn('PERSONA_SPARK', env)) return null;
  return withOwnLife(
    await withSpark(await read(bundleDir, CHARACTER_FILE), bundleDir, env),
    bundleDir
  );
}
