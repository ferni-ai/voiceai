/**
 * The boot line's commit comes from BUILD_SHA, which lk-built images get from the
 * .build-sha file the deploy-agent chain writes. Each test runs the real loader and
 * then reads the commit back out of the EFFECTIVE_SETTINGS line the worker logs.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBuildSha } from '../build-sha.js';
import { effectiveSettingsLines } from '../effective-settings.js';

const SHA = '8d2324c669484919cccbdd65256b0d66070efc56';

/** The commit field of the first EFFECTIVE_SETTINGS line. */
const bootCommit = (env: Record<string, string | undefined>): string =>
  JSON.parse((effectiveSettingsLines(env)[0] ?? '').replace(/^EFFECTIVE_SETTINGS /, '')).commit;

describe('loadBuildSha', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'build-sha-'));
    file = join(dir, '.build-sha');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('logs the commit from the file when BUILD_SHA is unset', () => {
    writeFileSync(file, `${SHA}\n`);
    const env: Record<string, string | undefined> = {};
    expect(bootCommit(env)).toBe('unknown');

    expect(loadBuildSha(env, file)).toBe(SHA);
    expect(env.BUILD_SHA).toBe(SHA);
    expect(bootCommit(env)).toBe(SHA);
  });

  it('logs unknown when the file is missing', () => {
    const env: Record<string, string | undefined> = {};
    expect(loadBuildSha(env, file)).toBeUndefined();
    expect(env.BUILD_SHA).toBeUndefined();
    expect(bootCommit(env)).toBe('unknown');
  });

  it('ignores a file that is not a commit hash', () => {
    writeFileSync(file, 'not-a-sha\n');
    const env: Record<string, string | undefined> = {};
    expect(loadBuildSha(env, file)).toBeUndefined();
    expect(bootCommit(env)).toBe('unknown');
  });

  it('keeps an env BUILD_SHA over the file', () => {
    writeFileSync(file, `${SHA}\n`);
    const env: Record<string, string | undefined> = { BUILD_SHA: 'abc1234' };
    expect(loadBuildSha(env, file)).toBe('abc1234');
    expect(bootCommit(env)).toBe('abc1234');
  });
});
