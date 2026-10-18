import { describe, expect, it } from 'vitest';
import { cliErrors, verdict } from '../ci/cli-typecheck-ratchet.mjs';

const err = (file) => `${file}(1,1): error TS2307: Cannot find module 'x'.`;
const out = (...lines) => lines.join('\n');

describe('cli typecheck ratchet', () => {
  it('counts only errors in apps/cli/src', () => {
    const output = out(
      err('apps/cli/src/index.ts'),
      err('apps/cli/src/utils/argv.ts'),
      err('src/services/books/google-books.ts'),
      'apps/cli/src/index.ts(2,2): warning: not an error'
    );
    expect(cliErrors(output)).toHaveLength(2);
  });

  it('fails when the count rises above the baseline', () => {
    const v = verdict(
      { status: 2, signal: null, output: out(err('apps/cli/src/a.ts'), err('apps/cli/src/b.ts')) },
      1
    );
    expect(v).toMatchObject({ ok: false, count: 2 });
  });

  it('passes at or below the baseline, and asks to lower it when below', () => {
    expect(verdict({ status: 2, signal: null, output: err('apps/cli/src/a.ts') }, 1).ok).toBe(true);
    const lower = verdict({ status: 0, signal: null, output: '' }, 5);
    expect(lower).toMatchObject({ ok: true, count: 0 });
    expect(lower.message).toContain('--update');
  });

  it('fails when tsc crashes instead of reading the silence as 0 errors', () => {
    expect(
      verdict({ status: 134, signal: null, output: 'FATAL ERROR: heap out of memory' }, 300).ok
    ).toBe(false);
    expect(verdict({ status: null, signal: 'SIGKILL', output: '' }, 300).ok).toBe(false);
    expect(verdict({ status: 2, signal: null, output: 'Killed' }, 300).ok).toBe(false);
  });
});
