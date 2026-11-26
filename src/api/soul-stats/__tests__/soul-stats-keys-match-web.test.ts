/**
 * The browser (apps/web/src/services/soul-stats.service.ts) and this server each keep
 * SOUL_COUNT_KEYS. The body schema is strict and needs every key, so a key added or
 * renamed on one side only makes every POST a 400 and stops reporting on every page.
 * This reads the web list and fails on any difference, order included (#4069).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SOUL_COUNT_KEYS, soulStatsBodySchema } from '../soul-stats-input.js';

const WEB_SERVICE = fileURLToPath(
  new URL('../../../../apps/web/src/services/soul-stats.service.ts', import.meta.url)
);

function webKeys(): string[] {
  const source = readFileSync(WEB_SERVICE, 'utf8');
  const list = /export const SOUL_COUNT_KEYS = \[([^\]]*)\] as const/.exec(source)?.[1];
  if (list === undefined) throw new Error(`No SOUL_COUNT_KEYS list in ${WEB_SERVICE}`);
  return [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('soul count keys, server and browser', () => {
  it('the browser sends exactly the keys the server takes, in the same order', () => {
    expect(webKeys()).toEqual([...SOUL_COUNT_KEYS]);
  });

  it('the body schema requires exactly SOUL_COUNT_KEYS', () => {
    expect(Object.keys(soulStatsBodySchema.shape.counts.shape)).toEqual([...SOUL_COUNT_KEYS]);
  });
});
