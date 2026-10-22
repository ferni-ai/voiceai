/**
 * FlagName must stay a literal union of the manifest's names: if it widened to
 * string, the ~200 flagOn/flagModeOf call sites would accept any name with no error.
 * pnpm typecheck checks this file (src/** includes __tests__); vitest only runs it.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { FLAG_MANIFEST, type FlagName } from '../flag-manifest.js';

describe('FlagName', () => {
  it('is a literal union, not string', () => {
    expectTypeOf<FlagName>().not.toEqualTypeOf<string>();
    expectTypeOf<'TURN_KEEPER'>().toMatchTypeOf<FlagName>();
    // @ts-expect-error an unknown name is not a FlagName
    const unknown: FlagName = 'NOT_A_FLAG';
    void unknown;
  });

  it('keeps each default as its literal type', () => {
    expectTypeOf(FLAG_MANIFEST.TURN_KEEPER.default).toEqualTypeOf<'on'>();
    expectTypeOf(FLAG_MANIFEST.WRAP_UP.default).toEqualTypeOf<'off'>();
  });
});
