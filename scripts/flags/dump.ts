/**
 * pnpm flags:dump — fingerprints of FLAG_MANIFEST, so a PR that moves flags
 * between files can show base and head are the same: the sha256 of the sorted
 * entries must not change, and neither may the EFFECTIVE_SETTINGS hash of an
 * empty env. keyOrderSha256 changes only if the key order does.
 */
import { createHash } from 'node:crypto';
import { effectiveSettings } from '../../src/config/effective-settings.js';
import { FLAG_MANIFEST } from '../../src/config/flag-manifest.js';

const sha256 = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const keys = Object.keys(FLAG_MANIFEST) as (keyof typeof FLAG_MANIFEST)[];
const sorted = [...keys].sort().map((name) => [name, FLAG_MANIFEST[name]]);
console.log(
  JSON.stringify(
    {
      count: keys.length,
      entriesSha256: sha256(sorted),
      keyOrderSha256: sha256(keys),
      keysSorted: keys.every((key, i) => i === 0 || keys[i - 1] < key),
      effectiveSettingsHash: effectiveSettings({}).hash,
    },
    null,
    2
  )
);
