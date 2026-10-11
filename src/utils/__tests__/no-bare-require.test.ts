/**
 * Ratchet: no bare `require()` in app source.
 *
 * The agent runs as plain Node ESM (build-fast.ts emits per-file ESM with no
 * createRequire banner), where `require` is undefined. A bare `require(...)`
 * throws ReferenceError, the surrounding try/catch usually swallows it, and the
 * feature silently never runs. Vitest supplies `require`, so unit tests pass.
 *
 * Use a static import, `await import()` for optional or heavy modules, or
 * `const require = createRequire(import.meta.url)` for genuine CJS-only JSON or
 * packages. ALLOWED lists the sites not yet fixed; a count may only go down.
 * When you fix a file, delete its entry.
 *
 * Test code is out of scope (__tests__, *.test.ts, src/tests/): it runs under
 * vitest, which provides `require`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SRC = join(REPO_ROOT, 'src');

const ALLOWED: Record<string, number> = {
  // voice batch (#770)
  'src/agents/shared/handoff/session-state.ts': 5,
  'src/agents/shared/worker-readiness.ts': 1,
  'src/agents/voice-agent/transcript-handler.ts': 2,
  'src/speech/coordination/persona-acknowledgments.ts': 1,
  'src/tools/orchestrator/orchestrator-helpers.ts': 1,
  'src/tools/semantic-router/advanced/intelligent/ferni-intents.ts': 1,
  'src/tools/semantic-router/advanced/intelligent/hierarchical-classifier.ts': 1,
  // dead: no importer, delete the file
  'src/agents/voice-agent/echo-prevention.ts': 2,
  // outreach and personality batch (#765)
  'src/personality/infrastructure/legacy-bridge.ts': 2,
  'src/personality/v2/index.ts': 3,
  'src/services/outreach/decision-engine.ts': 2,
  'src/services/outreach/engagement/personalization-engine.ts': 2,
  // memory and firebase stores
  'src/intelligence/predictive/embeddings/embedding-persistence.ts': 1,
  'src/memory/dynamic/deep-extraction-worker.ts': 1,
  'src/memory/knowledge-graph/index.ts': 2,
  'src/memory/memory-decay.ts': 1,
  'src/services/ambient-mode/ambient-state-manager.ts': 1,
  'src/services/health/health-data-store.ts': 1,
  'src/services/visual-memory/visual-memory-store.ts': 2,
  'src/tools/domains/information/preferences/storage.ts': 1,
};

/** Count `require(...)` and `require.x(...)` calls on an unbound `require`. */
function countBareRequires(fileName: string, text: string): number {
  if (!text.includes('require')) return 0;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
  let bound = false;
  let calls = 0;
  const visit = (node: ts.Node): void => {
    // `const require = createRequire(import.meta.url)` makes every call legitimate.
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'require') {
      bound = true;
    }
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.expression
        : node.expression;
      if (ts.isIdentifier(callee) && callee.text === 'require') calls++;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return bound ? 0 : calls;
}

function appSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') return [];
      if (path === join(SRC, 'tests')) return [];
      return appSourceFiles(path);
    }
    if (!/\.(ts|mts|tsx)$/.test(name) || name.endsWith('.d.ts')) return [];
    if (/\.(test|spec)\.tsx?$/.test(name)) return [];
    return [path];
  });
}

describe('countBareRequires', () => {
  it('counts bare require calls, including require.resolve', () => {
    const text = "const a = require('a');\nconst b = require('b')(1);\nrequire.resolve('c');";
    expect(countBareRequires('x.ts', text)).toBe(3);
  });

  it('ignores comments, strings, member calls and a createRequire binding', () => {
    expect(
      countBareRequires(
        'x.ts',
        "// require('a')\n/* require('b') */\nconst s = \"require('c')\";\nmod.require('d');\nrequireAdmin();"
      )
    ).toBe(0);
    expect(
      countBareRequires(
        'x.ts',
        "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\nrequire('pkg/data.json');"
      )
    ).toBe(0);
  });
});

describe('no bare require() in app source', () => {
  const found: Record<string, number> = {};
  for (const file of appSourceFiles(SRC)) {
    const count = countBareRequires(file, readFileSync(file, 'utf8'));
    if (count > 0) found[relative(REPO_ROOT, file).split(sep).join('/')] = count;
  }

  it('adds no new bare require() anywhere in src/', () => {
    const grown = Object.entries(found)
      .filter(([file, count]) => count > (ALLOWED[file] ?? 0))
      .map(([file, count]) => `${file}: ${count} (allowed ${ALLOWED[file] ?? 0})`);
    expect(grown, 'bare require() throws under ESM; use import or createRequire').toEqual([]);
  });
});
