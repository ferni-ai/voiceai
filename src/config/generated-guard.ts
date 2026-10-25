/**
 * Load-time checks on the two gitignored generated lists (generated-lists.ts).
 *
 * A missing file already fails at import (ERR_MODULE_NOT_FOUND). These catch the
 * quieter case: a file that exists but was generated from the wrong or a partial
 * tree, which would otherwise boot with flags missing from FLAG_MANIFEST or names
 * missing from EFFECTIVE_SETTINGS.
 *
 * @module config/generated-guard
 */

/** Fewer env names than this means the scan read the wrong tree (src/ reads 1000+). */
export const MIN_ENV_READ_NAMES = 500;

/** Throws, naming the file and the fix, when a generated list has fewer than min entries. */
export function assertGeneratedList(file: string, count: number, min: number): void {
  if (count >= min) return;
  throw new Error(
    `src/config/${file} lists ${count} entries (expected at least ${min}). It is generated, ` +
      'not committed: run `pnpm gen:lists` (typecheck, build and tests run it for you).'
  );
}
