/**
 * CRISIS_BRAKE_V2 off is main: every decision, script and guidance on the fictional calls in
 * crisis-brake-golden.ts is byte-identical to crisis-brake.golden.json, captured on main at
 * bf5d4e9b2 before the flag existed. Regenerate only from main: UPDATE_CRISIS_GOLDEN=1.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { captureCrisisGolden } from './crisis-brake-golden.js';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), 'crisis-brake.golden.json');
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

describe('CRISIS_BRAKE_V2 off is byte-identical to main', () => {
  it.each([
    ['unset', {}],
    ['off', { CRISIS_BRAKE_V2: 'off' }],
  ])('flag %s', async (_name, extra) => {
    const captured = json(await captureCrisisGolden(extra));
    if (process.env.UPDATE_CRISIS_GOLDEN === '1') writeFileSync(GOLDEN, captured);
    expect(captured).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('the golden can go red: the flag on changes what the caller hears', async () => {
    const on = json(await captureCrisisGolden({ CRISIS_BRAKE_V2: 'on' }));
    expect(on).not.toBe(readFileSync(GOLDEN, 'utf8'));
  });
});
