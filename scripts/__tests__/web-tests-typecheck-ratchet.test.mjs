import { describe, expect, it } from 'vitest';
import { verdict, webTestErrors } from '../ci/web-tests-typecheck-ratchet.mjs';

const err = (file) => `${file}(1,1): error TS2532: Object is possibly 'undefined'.`;
// tsc runs with --listFiles: every checked file is printed as an absolute path.
const listed = '/repo/apps/web/tests/setup.ts';
const out = (...lines) => [listed, ...lines].join('\n');

describe('web tests typecheck ratchet', () => {
  it('counts only errors in apps/web/tests, not the root src files tests import', () => {
    const output = out(
      err('tests/setup.ts'),
      err('tests/ui/avatar.test.ts'),
      err('../../src/tests/gcp-test-guard.ts'),
      err('src/main.ts'),
      'tests/setup.ts(2,2): warning: not an error'
    );
    expect(webTestErrors(output)).toHaveLength(2);
  });

  it('fails when the count rises above the baseline', () => {
    const v = verdict(
      { status: 2, signal: null, output: out(err('tests/a.test.ts'), err('tests/b.test.ts')) },
      1
    );
    expect(v).toMatchObject({ ok: false, count: 2 });
    expect(v.message).toContain('rose from 1 to 2');
  });

  it('passes at or below the baseline, and asks to lower it when below', () => {
    expect(verdict({ status: 2, signal: null, output: out(err('tests/a.test.ts')) }, 1).ok).toBe(
      true
    );
    const lower = verdict({ status: 2, signal: null, output: out(err('../../src/x.ts')) }, 5);
    expect(lower).toMatchObject({ ok: true, count: 0 });
    expect(lower.message).toContain('web-tests-typecheck-ratchet.mjs --update');
  });

  it('fails when tsc checked no tests/ file, instead of reading every error as fixed', () => {
    const v = verdict({ status: 0, signal: null, output: '/repo/apps/web/src/main.ts' }, 503);
    expect(v).toMatchObject({ ok: false, count: null });
  });

  it('fails on a tsconfig or option error, which has no file and may mean nothing was checked', () => {
    const noInputs = `${listed}\nerror TS18003: No inputs were found in config file 'tsconfig.tests.json'.`;
    expect(verdict({ status: 2, signal: null, output: noInputs }, 503)).toMatchObject({
      ok: false,
      count: null,
    });
    const badOption = `${listed}\nerror TS5023: Unknown compiler option 'nope'.`;
    expect(verdict({ status: 1, signal: null, output: badOption }, 503).ok).toBe(false);
  });

  it('fails when tsc crashes instead of reading the silence as 0 errors', () => {
    expect(
      verdict({ status: 134, signal: null, output: 'FATAL ERROR: heap out of memory' }, 503).ok
    ).toBe(false);
    expect(verdict({ status: null, signal: 'SIGKILL', output: '' }, 503).ok).toBe(false);
    expect(verdict({ status: 2, signal: null, output: 'Killed' }, 503).ok).toBe(false);
  });
});
