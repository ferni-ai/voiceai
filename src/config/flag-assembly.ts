/**
 * Builds FLAG_MANIFEST from the legacy registry literal plus the one-file-per-flag
 * entries in src/config/flags/ (re-exported by flags/index.generated.ts).
 *
 * The result is a plain object with keys sorted by UTF-16 code unit. Copying out
 * of the module namespace means no runtime detail of it (esbuild's getter-based
 * `__export`, vite-node, native ESM) can leak into Object.keys, and sorting makes
 * the key order the same however the entries are split between files.
 *
 * @module config/flag-assembly
 */
import type { FlagSpec } from './flag-spec.js';

/** Every key is a flag. A mapped type, not Record<string, FlagSpec>, so keyof stays a literal union. */
type Specs<T> = { readonly [K in keyof T]: FlagSpec };

/** B, or an unsatisfiable shape naming the flags defined in both places (fails tsc). */
type NoOverlap<A, B> = [keyof A & keyof B] extends [never]
  ? B
  : { readonly __flagsDefinedTwice: keyof A & keyof B };

const byCodeUnit = ([a]: [string, unknown], [b]: [string, unknown]): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** legacy and files merged into one sorted plain object; throws if a name is in both. */
export function assembleManifest<A extends Specs<A>, B extends Specs<B>>(
  legacy: A,
  files: B & NoOverlap<A, B>
): A & B {
  const entries: Array<[string, FlagSpec]> = Object.entries(legacy);
  const seen = new Set(Object.keys(legacy));
  for (const [name, spec] of Object.entries(files as B)) {
    if (seen.has(name)) {
      throw new Error(`Flag ${name} is defined both in flag-manifest*.ts and in flags/${name}.ts`);
    }
    seen.add(name);
    entries.push([name, spec as FlagSpec]);
  }
  return Object.fromEntries(entries.sort(byCodeUnit)) as A & B;
}
