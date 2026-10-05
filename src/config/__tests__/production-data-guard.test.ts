import { describe, expect, it, vi } from 'vitest';

import { dataGuardVerdict, refuseProductionDataOutsideProduction } from '../production-data-guard.js';

function run(env: Record<string, string | undefined>) {
  const exit = vi.fn() as unknown as (code: number) => never;
  const write = vi.fn();
  refuseProductionDataOutsideProduction('test process', env, exit, write);
  return { exit: exit as unknown as ReturnType<typeof vi.fn>, write };
}

describe('production data guard', () => {
  it('refuses a dev process with no emulator (the 2026-10-04 incident)', () => {
    const { exit, write } = run({ NODE_ENV: 'development' });
    expect(exit).toHaveBeenCalledWith(1);
    expect(write.mock.calls[0][0]).toContain('FIRESTORE_EMULATOR_HOST');
  });

  it('refuses when NODE_ENV is unset', () => {
    expect(run({}).exit).toHaveBeenCalledWith(1);
  });

  it('lets production run', () => {
    expect(run({ NODE_ENV: 'production' }).exit).not.toHaveBeenCalled();
  });

  it('lets staging previews run (Cloud Run staging-* services use NODE_ENV=staging)', () => {
    expect(run({ NODE_ENV: 'staging' }).exit).not.toHaveBeenCalled();
  });

  it('lets a dev process on the emulator run', () => {
    expect(run({ NODE_ENV: 'development', FIRESTORE_EMULATOR_HOST: 'localhost:8080' }).exit).not.toHaveBeenCalled();
  });

  it('lets an explicit opt-in run, loudly', () => {
    const { exit, write } = run({ NODE_ENV: 'development', ALLOW_PRODUCTION_DATA: '1' });
    expect(exit).not.toHaveBeenCalled();
    expect(write.mock.calls[0][0]).toContain('WRITES production');
  });

  it('only accepts the exact opt-in value', () => {
    expect(dataGuardVerdict({ NODE_ENV: 'development', ALLOW_PRODUCTION_DATA: 'true' })).toBe('refuse');
  });

  it('leaves vitest to src/tests/setup.ts', () => {
    expect(dataGuardVerdict({ NODE_ENV: 'test', VITEST: 'true' })).toBe('test');
  });
});
