/**
 * Async auth guards must be awaited.
 *
 * requireAuth/requireAdmin are async and resolve to null after sending a 401/403.
 * Called without await, `const auth = requireAdmin(req, res); if (!auth) return`
 * never returns: a Promise is always truthy. The caller gets the 401, but the
 * handler keeps running and its writes execute unauthenticated. That shipped in
 * every /api/v1/admin route and in POST /api/push/send.
 *
 * This scans src/ for calls to any async export of auth-middleware.ts that are
 * not awaited, returned, or chained.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const MIDDLEWARE = join(SRC, 'api', 'auth-middleware.ts');

function asyncGuards(): string[] {
  const source = readFileSync(MIDDLEWARE, 'utf8');
  return [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === 'node_modules' || name === '__tests__' ? [] : sourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

/** `file:line: code` for every call to a guard that isn't awaited, returned or chained. */
export function findUnawaitedCalls(source: string, guards: string[], file = 'file'): string[] {
  const pattern = new RegExp(`(?<![\\w.])(${guards.join('|')})\\(`);
  return source.split('\n').flatMap((line, i) => {
    const code = line.trim();
    if (!pattern.test(code) || code.startsWith('//') || code.startsWith('*')) return [];
    if (/\bawait\s+\w+\(|\breturn\s+\w+\(|\bfunction\s+\w+\(|\.then\(/.test(code)) return [];
    if (/^import\b|^export\s*\{|^\w+,$/.test(code)) return [];
    return [`${file}:${i + 1}: ${code}`];
  });
}

describe('async auth guards', () => {
  const guards = asyncGuards();

  it('finds the async guards (scanner sanity check)', () => {
    expect(guards).toEqual(expect.arrayContaining(['requireAuth', 'requireAdmin']));
    expect(
      findUnawaitedCalls('  const auth = requireAdmin(req, res);\n  const ok = await requireAuth(req, res);', guards)
    ).toEqual(['file:1: const auth = requireAdmin(req, res);']);
  });

  it('are awaited everywhere in src/', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== MIDDLEWARE)
      .flatMap((file) =>
        findUnawaitedCalls(readFileSync(file, 'utf8'), guards, relative(SRC, file))
      );
    expect(offenders).toEqual([]);
  });
});
