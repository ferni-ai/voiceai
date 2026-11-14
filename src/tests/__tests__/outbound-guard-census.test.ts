/**
 * Every test file that steps around the outbound guard (src/tests/outbound-guard.ts)
 * is named here, with how many times it does.
 *
 * Three ways around it, all found by reading the text of each test file:
 *   1. allowOutbound('<reason>'), the guard's own opt-out;
 *   2. vi.unmock / vi.doUnmock of one of the four guarded packages;
 *   3. the real package fetched past the guard: importActual('<package>'), or
 *      a vi.mock of the package whose factory takes the original.
 *
 * A file that stubs a package itself (vi.mock with its own fake) is not on the
 * list: no real client can come out of it.
 *
 * Limits: this reads text, not behaviour. A package name built at run time, or
 * a helper in another file that does one of the three, is not seen.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ROOTS = ['src', 'tests', 'scripts', 'apps', 'design-system'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.cache', 'coverage']);
const PACKAGE = String.raw`['"\`](?:@google-cloud/vertexai|openai|@google/genai|google-auth-library)['"\`]`;

/** The three ways around the guard. Each match is one step around it. */
const WAYS_AROUND: RegExp[] = [
  /\ballowOutbound\s*\(/g,
  new RegExp(String.raw`\bvi\.(?:unmock|doUnmock)\s*\(\s*${PACKAGE}`, 'g'),
  new RegExp(String.raw`\bimportActual\s*(?:<[^>]*>)?\s*\(\s*${PACKAGE}`, 'g'),
  new RegExp(
    String.raw`\bvi\.(?:mock|doMock)\s*\(\s*${PACKAGE}\s*,\s*(?:async\s*)?\(\s*[A-Za-z_]`,
    'g'
  ),
];

/**
 * The whole list. A new entry needs a reason a reviewer accepts; an entry
 * whose file stops stepping around the guard comes off.
 */
const NAMED: Record<string, number> = {
  // Its afterEach undoes the fake GoogleGenAI its rows install (vi.doUnmock), which also
  // drops the guard for the rest of the file. Every row there that imports the package
  // installs its fake first.
  'src/config/__tests__/gemini-billing-labels.test.ts': 1,
  // Builds real @google/genai clients to read the host they would send to; sends nothing.
  'src/config/__tests__/vertex-endpoint.test.ts': 1,
  // The guard's own rows: the opt-out is the thing under test.
  'src/tests/__tests__/outbound-guard.test.ts': 4,
  // The guard's probe for a file that says why it builds a client.
  'src/tests/__tests__/outbound-probes/says-why.test.ts': 1,
};

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : testFiles(path);
    const isTest = /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name) || path.includes('/__tests__/');
    return isTest && /\.[cm]?[jt]sx?$/.test(name) ? [path] : [];
  });
}

/** Steps around the guard in one file's text, comments included. */
function stepsAround(text: string): number {
  return WAYS_AROUND.reduce((n, way) => n + (text.match(way)?.length ?? 0), 0);
}

describe('test files that step around the outbound guard', () => {
  const found: Record<string, number> = {};
  for (const root of ROOTS) {
    for (const file of testFiles(join(ROOT, root))) {
      const rel = relative(ROOT, file);
      // This file names the three ways in its own text.
      if (rel === 'src/tests/__tests__/outbound-guard-census.test.ts') continue;
      const steps = stepsAround(readFileSync(file, 'utf8'));
      if (steps > 0) found[rel] = steps;
    }
  }

  it('are exactly the named ones, with the named number of steps', () => {
    expect(found).toEqual(NAMED);
  });

  it.each([
    ["allowOutbound('a reason');", 1],
    ["vi.unmock('openai');", 1],
    ['vi.doUnmock("@google/genai");', 1],
    ["await vi.importActual<typeof import('openai')>('openai');", 1],
    ["vi.mock('google-auth-library', async (importOriginal) => importOriginal());", 1],
    ["vi.mock('@google-cloud/vertexai', (original) => original());", 1],
    ["// allowOutbound('in a comment') still counts", 1],
    ["allowOutbound('one'); allowOutbound('two');", 2],
    // Its own fake: no real client can come out of it.
    ["vi.mock('openai', () => ({ default: class {} }));", 0],
    ["vi.mock('openai');", 0],
    // Another package.
    ["vi.unmock('firebase-admin/app');", 0],
    ["await vi.importActual('../llm-utils.js');", 0],
  ])('%s is %i step(s) around', (text, steps) => {
    expect(stepsAround(text)).toBe(steps);
  });
});
