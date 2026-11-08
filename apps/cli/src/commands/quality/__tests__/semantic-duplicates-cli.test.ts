import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../semantic-duplicates.js';

describe('runCli', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes the arguments through and leaves the exit code alone when the check has findings', async () => {
    const run = vi.fn(async () => [{ fn: { name: 'copy' } }]);
    const exit = vi.fn();

    await runCli(['--out', 'dups.md'], run, exit);

    expect(run).toHaveBeenCalledWith(['--out', 'dups.md']);
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs the error and exits 1 when the check throws', async () => {
    const error = new Error('model load failed');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.fn();

    await runCli([], async () => Promise.reject(error), exit);

    expect(logged).toHaveBeenCalledWith(error);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
