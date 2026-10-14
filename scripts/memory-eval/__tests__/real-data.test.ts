import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertVertexOnly, isInside, writePrivate } from '../real-data.js';

const vertex = { GOOGLE_CLOUD_PROJECT: 'johnb-2025' } as NodeJS.ProcessEnv;

describe('assertVertexOnly', () => {
  it('passes only when no OpenAI fallback can be reached', () => {
    expect(() => assertVertexOnly(vertex)).not.toThrow();
    expect(() => assertVertexOnly({ ...vertex, USE_VERTEX_AI: 'true' })).not.toThrow();
  });

  it('refuses an OpenAI key, consumer Gemini, or no project, and names each', () => {
    expect(() => assertVertexOnly({ ...vertex, OPENAI_API_KEY: 'sk-x' })).toThrow(/OPENAI_API_KEY/);
    expect(() => assertVertexOnly({ ...vertex, USE_VERTEX_AI: 'false' })).toThrow(
      /USE_VERTEX_AI=false/
    );
    expect(() => assertVertexOnly({})).toThrow(/GOOGLE_CLOUD_PROJECT is unset/);
  });

  it('refuses tasks routed to Claude, but not a Claude key alone', () => {
    const claude = { ...vertex, ANTHROPIC_API_KEY: 'sk-ant-x' };
    expect(() => assertVertexOnly(claude)).not.toThrow();
    expect(() => assertVertexOnly({ ...claude, CLAUDE_LLM_TASKS: 'summary' })).toThrow(
      /CLAUDE_LLM_TASKS \(summary\)/
    );
  });
});

describe('isInside', () => {
  const root = resolve('/work/voiceai');

  it('is true for the root and paths under it, false for siblings and parents', () => {
    expect(isInside(root, root)).toBe(true);
    expect(isInside(join(root, 'scripts/x'), root)).toBe(true);
    expect(isInside('/work/voiceai-private', root)).toBe(false);
    expect(isInside('/work', root)).toBe(false);
  });

  it('does not take a directory named "..x" for a parent', () => {
    expect(isInside(join(root, '..x'), root)).toBe(true);
  });

  it('sees through a symlink to the repo, either way round', () => {
    const base = mkdtempSync(join(tmpdir(), 'real-data-'));
    const repo = join(base, 'repo');
    mkdirSync(repo);
    const link = join(base, 'link');
    symlinkSync(repo, link);
    expect(isInside(join(link, 'out', 'cases.json'), repo)).toBe(true);
    expect(isInside(join(repo, 'out'), link)).toBe(true);
    expect(isInside(join(base, 'elsewhere'), link)).toBe(false);
  });

  it('ignores capitals where the file system does', () => {
    const repo = mkdtempSync(join(tmpdir(), 'real-data-'));
    const shouted = join(repo.toUpperCase(), 'out');
    expect(isInside(shouted, repo, true)).toBe(true);
    expect(isInside(join(`${repo}-private`.toUpperCase(), 'out'), repo, true)).toBe(false);
  });

  it.runIf(process.platform === 'darwin')(
    'folds case by default on macOS, and takes /tmp for /private/tmp',
    () => {
      const repo = mkdtempSync(join(tmpdir(), 'real-data-'));
      expect(isInside(join(repo.toUpperCase(), 'out'), repo)).toBe(true);
      const dir = mkdtempSync('/tmp/real-data-');
      expect(isInside(join('/private', dir, 'out'), dir)).toBe(true);
      expect(isInside(join(dir, 'out'), join('/private', dir))).toBe(true);
    }
  );
});

describe('writePrivate', () => {
  it('writes a file readable only by its owner, even over an existing looser file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'real-data-'));
    const file = join(dir, 'cases.json');
    writeFileSync(file, 'old');
    chmodSync(file, 0o644);
    expect(statSync(file).mode & 0o777).toBe(0o644);
    writePrivate(file, '[]');
    expect(readFileSync(file, 'utf8')).toBe('[]');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});
