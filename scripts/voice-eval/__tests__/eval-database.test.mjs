import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DEV_DATABASE,
  DEV_DATABASE_DEFAULT,
  databaseFromArgs,
  documentsUrl,
  evalDatabase,
} from '../eval-database.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'eval-database.mjs');
/** `node eval-database.mjs <env>`, as run.sh and run-nightly.sh call it. */
const cli = (env, vars = {}) => {
  const { EVAL_DEV_DATABASE: _drop, ...rest } = process.env;
  const r = spawnSync(process.execPath, [CLI, env], {
    encoding: 'utf8',
    env: { ...rest, ...vars },
  });
  return { out: r.stdout.trim(), status: r.status };
};

describe('evalDatabase: the Firestore database an eval env uses', () => {
  it('prod is always (default), whatever the dev switch says', () => {
    expect(evalDatabase('prod', { vars: { EVAL_DEV_DATABASE: 'ferni-dev' } })).toBe('(default)');
  });

  it('dev, local and phone use ferni-dev since the 2026-10-23 cutover', () => {
    expect(DEV_DATABASE_DEFAULT).toBe(DEV_DATABASE);
    for (const env of ['dev', 'local', 'phone']) {
      expect(evalDatabase(env, { vars: {} })).toBe('ferni-dev');
    }
  });

  it('EVAL_DEV_DATABASE still overrides dev for one run (and (default) is the rollback)', () => {
    for (const env of ['dev', 'local', 'phone']) {
      expect(evalDatabase(env, { vars: { EVAL_DEV_DATABASE: '(default)' } })).toBe('(default)');
      expect(evalDatabase(env, { vars: { EVAL_DEV_DATABASE: 'other-db' } })).toBe('other-db');
    }
  });

  it('the CLI run.sh and the nightly read prints the same picks', () => {
    expect(cli('prod')).toEqual({ out: '(default)', status: 0 });
    expect(cli('prod', { EVAL_DEV_DATABASE: 'ferni-dev' })).toEqual({
      out: '(default)',
      status: 0,
    });
    for (const env of ['dev', 'local', 'phone']) {
      expect(cli(env)).toEqual({ out: 'ferni-dev', status: 0 });
      expect(cli(env, { EVAL_DEV_DATABASE: '(default)' })).toEqual({ out: '(default)', status: 0 });
    }
    expect(cli('staging').status).toBe(2);
  });

  it('the CLI still prints when called through a symlinked path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eval-db-'));
    symlinkSync(dirname(CLI), join(dir, 'linked'));
    const r = spawnSync(process.execPath, [join(dir, 'linked', 'eval-database.mjs'), 'dev'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    expect([r.stdout.trim(), r.status]).toEqual(['ferni-dev', 0]);
  });

  it('ignores FIRESTORE_DATABASE, which a dev .env sets for every env', () => {
    expect(evalDatabase('prod', { vars: { FIRESTORE_DATABASE: 'ferni-dev' } })).toBe('(default)');
  });

  it('a --database override wins, and an unknown env throws instead of guessing', () => {
    expect(evalDatabase('prod', { override: 'ferni-dev', vars: {} })).toBe('ferni-dev');
    expect(() => evalDatabase('staging', { vars: {} })).toThrow(/unknown env/);
  });

  it('databaseFromArgs: --env resolves like evalDatabase, --database wins, no silent default', () => {
    const args = (...a) => ['node', 'script', '--project', 'johnb-2025', ...a];
    expect(databaseFromArgs(args('--env', 'dev'), { vars: {} })).toBe('ferni-dev');
    expect(databaseFromArgs(args('--env', 'prod'), { vars: {} })).toBe('(default)');
    expect(databaseFromArgs(args('--env', 'dev'), { vars: { EVAL_DEV_DATABASE: 'x' } })).toBe('x');
    expect(databaseFromArgs(args('--env', 'dev', '--database', 'y'), { vars: {} })).toBe('y');
    expect(databaseFromArgs(args('--database', 'ferni-dev'), { vars: {} })).toBe('ferni-dev');
    // cleanup-users: neither flag is prod, as documented; seed-tier passes no fallback
    expect(databaseFromArgs(args(), { fallback: '(default)', vars: {} })).toBe('(default)');
    expect(() => databaseFromArgs(args(), { vars: {} })).toThrow(/--env .* or --database/);
    expect(() => databaseFromArgs(args('--env', 'staging'), { vars: {} })).toThrow(/unknown env/);
  });

  it('builds the REST documents base for a named database', () => {
    expect(documentsUrl('p', 'ferni-dev')).toBe(
      'https://firestore.googleapis.com/v1/projects/p/databases/ferni-dev/documents'
    );
    expect(documentsUrl('p', '(default)')).toContain('/databases/(default)/documents');
  });
});
