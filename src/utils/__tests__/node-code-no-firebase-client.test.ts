/**
 * Code that runs in Node must not load the Firebase client SDK (`firebase`, `firebase/*`,
 * `@firebase/*`), directly or through anything it imports. `firebase-admin` is the server
 * SDK and stays allowed.
 *
 * firebase 13 declares `engines.node >=24.12.0` (firebase-js-sdk #10314), a support floor
 * for Node consumers. We build and test on Node 22 and declare our own build/test floor
 * instead, which is honest only while the client SDK runs in the browser. This test keeps
 * that true, except for the named EXCEPTIONS below. When the runtime moves to Node 24,
 * drop the exceptions and this test.
 *
 * Every git-visible source file is a Node entry except browser code (apps/web/src, and the
 * apps/website page scripts and service worker); apps/web vitest files are entries too. A
 * runtime-built `import(name)` is invisible to this, as to any static scan. From each entry the test follows relative imports, apps/web's
 * `@/` and `@design-system/*` aliases, `import()` and `require()` (type-only imports are
 * erased, so they are skipped), including INTO apps/web/src. A chain that reaches a
 * client SDK specifier fails, and the failure prints the chain. Two runtime facts are
 * honoured:
 * - apps/web/vitest.config.ts aliases some specifiers to a stub, so apps/web vitest files
 *   may reach exactly those specifiers (root tests have no such alias and load the real SDK).
 * - `vi.mock(path, () => ...)` with a factory that does not call the original replaces that
 *   module for the entry's whole test file, so the walk does not enter it.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const CLIENT_SDK = /^(firebase|@firebase\/[^/]+)(\/|$)/;
const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;
// apps/website's Eleventy configs, scripts and tests run in Node and stay entries.
const BROWSER = /^apps\/web\/src\/|^apps\/website\/[^/]+\/((src\/)?js\/|sw\.js$)/;
const WEB_VITEST = /^apps\/web\/(src|tests)\/.*\.test\.tsx?$/;
const PLAYWRIGHT = /^apps\/web\/(e2e|tests\/(e2e|first-paint|overlays))\//;
const EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx', '.json'];

/** Node entries allowed to reach the client SDK. An entry that no longer reaches it fails. */
const EXCEPTIONS: Record<string, string> = {
  'src/tests/trust-dashboard-contract.test.ts':
    'integration contract test of the real trust dashboard UI; loads firebase/auth under Node 22, green in CI. Node 24 removes the reason.',
  'src/tests/trust-together-contract.test.ts':
    'integration contract test of the real trust dashboard UI; loads firebase/auth under Node 22, green in CI. Node 24 removes the reason.',
  'src/tests/features/feature-sprint-e2e.test.ts':
    'reaches it only through lazy import()s (mobile-bottom-sheet > lazy-screens > marketplace.ui) that the test never triggers.',
};

interface FileInfo {
  edges: string[];
  sdk: string[];
  mocked: string[];
  unresolved: string[];
}

const isViMock = (e: ts.Expression): boolean =>
  ts.isPropertyAccessExpression(e) &&
  ts.isIdentifier(e.expression) &&
  e.expression.text === 'vi' &&
  e.name.text === 'mock';

/** A factory with no parameters that never calls the original replaces the module outright. */
const replacesModule = (factory: ts.Expression, text: string): boolean =>
  (ts.isArrowFunction(factory) || ts.isFunctionExpression(factory)) &&
  factory.parameters.length === 0 &&
  !/importActual|importOriginal/.test(text.slice(factory.pos, factory.end));

/** Value imports of one file, plus `vi.mock` targets whose factory never loads the original. */
function scan(file: string, text: string): { specs: string[]; mocks: string[] } {
  const specs: string[] = [];
  const mocks: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.isTypeOnly
        : node.isTypeOnly;
      if (!typeOnly && ts.isStringLiteral(node.moduleSpecifier))
        specs.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const [first, factory] = node.arguments;
      const callee = node.expression;
      if (first && ts.isStringLiteralLike(first)) {
        if (
          callee.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(callee) && callee.text === 'require')
        ) {
          specs.push(first.text);
        } else if (isViMock(callee) && factory && replacesModule(factory, text)) {
          mocks.push(first.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  if (/\b(import|require|from)\b/.test(text))
    visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false));
  return { specs, mocks };
}

/** Repo path a specifier loads, `null` for a package, or `undefined` when it cannot be resolved. */
function resolveSpec(from: string, spec: string, files: Set<string>): string | null | undefined {
  const bare = spec.split('?')[0] ?? spec;
  let base: string;
  if (bare.startsWith('.')) base = posix.normalize(posix.join(posix.dirname(from), bare));
  else if (from.startsWith('apps/web/') && bare.startsWith('@/'))
    base = `apps/web/src/${bare.slice(2)}`;
  else if (from.startsWith('apps/web/') && bare === '@design-system/components')
    base = 'design-system/components/index.ts';
  else if (from.startsWith('apps/web/') && bare.startsWith('@design-system'))
    base = `design-system/dist${bare.slice(14)}`;
  else return null;
  const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  const candidates = [base, ...EXTS.map((e) => stem + e), ...EXTS.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => files.has(c));
}

function buildGraph(
  read: (file: string) => string | undefined,
  all: string[]
): Map<string, FileInfo> {
  const files = new Set(all);
  const graph = new Map<string, FileInfo>();
  for (const file of all.filter((f) => CODE.test(f))) {
    const text = read(file);
    if (text === undefined) continue;
    const { specs, mocks } = scan(file, text);
    const info: FileInfo = { edges: [], sdk: [], mocked: [], unresolved: [] };
    for (const spec of specs) {
      if (CLIENT_SDK.test(spec)) info.sdk.push(spec);
      else {
        const target = resolveSpec(file, spec, files);
        if (target === undefined) info.unresolved.push(spec);
        else if (target && CODE.test(target)) info.edges.push(target);
      }
    }
    info.mocked = mocks.map((m) => (CLIENT_SDK.test(m) ? m : (resolveSpec(file, m, files) ?? m)));
    graph.set(file, info);
  }
  return graph;
}

/** Shortest import chain from `entry` to a client SDK specifier it would really load, or null. */
function chainToSdk(
  entry: string,
  graph: Map<string, FileInfo>,
  stubbed: string[]
): string[] | null {
  const cut = new Set([...stubbed, ...(graph.get(entry)?.mocked ?? [])]);
  const prev = new Map<string, string>();
  const queue = [entry];
  const seen = new Set(queue);
  const path = (f: string): string[] => (prev.has(f) ? [...path(prev.get(f) ?? ''), f] : [f]);
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    const info = graph.get(file);
    const hit = info?.sdk.find((s) => !cut.has(s));
    if (hit) return [...path(file), hit];
    for (const next of info?.edges ?? []) {
      if (seen.has(next) || cut.has(next)) continue;
      seen.add(next);
      prev.set(next, file);
      queue.push(next);
    }
  }
  return null;
}

/** apps/web/vitest.config.ts (and so its stub aliases) applies to these files; Playwright's does not. */
const runsUnderWebVitest = (f: string): boolean =>
  (WEB_VITEST.test(f) && !PLAYWRIGHT.test(f)) || f === 'apps/web/tests/setup.ts';

function nodeEntries(graph: Map<string, FileInfo>): string[] {
  return [...graph.keys()].filter((f) => !BROWSER.test(f) || WEB_VITEST.test(f));
}

/** `entry > ... > specifier` for each Node entry that loads the client SDK. */
function violations(graph: Map<string, FileInfo>, stubbed: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of nodeEntries(graph)) {
    const chain = chainToSdk(entry, graph, runsUnderWebVitest(entry) ? stubbed : []);
    if (chain) out.set(entry, chain.join(' > '));
  }
  return out;
}

/** The specifiers apps/web's vitest config points at its Firebase stub. */
function stubbedSpecifiers(): string[] {
  const config = readFileSync(join(ROOT, 'apps/web/vitest.config.ts'), 'utf8');
  return [...config.matchAll(/'(firebase\/[a-z-]+)':\s*firebaseStub/g)].map((m) => m[1] ?? '');
}

function repoGraph(): Map<string, FileInfo> {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      maxBuffer: 1 << 28,
    }
  );
  const all = out.toString('utf8').split('\0').filter(Boolean);
  const read = (f: string): string | undefined =>
    existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), 'utf8') : undefined;
  return buildGraph(read, all);
}

describe('the Firebase client SDK never runs in Node', () => {
  const graph = repoGraph();
  const found = violations(graph, stubbedSpecifiers());

  it('no Node entry reaches firebase, firebase/* or @firebase/* except the named exceptions', () => {
    expect(graph.size).toBeGreaterThan(1000); // the walk saw the repo, not an empty list
    const unexpected = [...found]
      .filter(([entry]) => !(entry in EXCEPTIONS))
      .map(([, chain]) => chain);
    expect(
      unexpected,
      'Node code must not load the Firebase client SDK: firebase 13 supports only Node >=24.12 and ' +
        "we declare the Node 22 build/test floor (see this file's header). Use firebase-admin on the server."
    ).toEqual([]);
  });

  it('every exception still reaches the client SDK (drop stale entries)', () => {
    expect(Object.keys(EXCEPTIONS).filter((entry) => !found.has(entry))).toEqual([]);
  });

  // Only apps/web depends on firebase, so only an import the walk cannot follow in or into
  // apps/web could hide a chain. Unresolved imports elsewhere (native .node addons, gitignored
  // generated files, stale paths in old scripts) cannot reach it.
  it('the walk has no blind spot in or into apps/web, where the client SDK is installed', () => {
    const intoWeb = (file: string, spec: string): boolean =>
      file.startsWith('apps/web/') || posix.join(posix.dirname(file), spec).startsWith('apps/web/');
    const blind = [...graph].flatMap(([file, info]) =>
      info.unresolved.filter((spec) => intoWeb(file, spec)).map((spec) => `${file} -> ${spec}`)
    );
    expect(blind).toEqual([]);
  });

  it("apps/web's vitest config still stubs the specifiers its tests may import", () => {
    expect(stubbedSpecifiers().sort()).toEqual(['firebase/app', 'firebase/auth']);
  });

  const stub = ['firebase/app', 'firebase/auth'];
  const fixture = (files: Record<string, string>): Map<string, FileInfo> =>
    buildGraph((f) => files[f], Object.keys(files));
  const sdkModule = { 'apps/web/src/sdk.ts': `import { getFirestore } from 'firebase/firestore';` };

  it.each([
    ['src/a.ts', { 'src/a.ts': `import { initializeApp } from 'firebase/app';` }],
    ['scripts/a.ts', { 'scripts/a.ts': `const auth = await import('firebase/auth');` }],
    ['apps/async/a.js', { 'apps/async/a.js': `const fb = require('firebase');` }],
    [
      'apps/web/vite.config.ts',
      { 'apps/web/vite.config.ts': `export * from '@firebase/firestore';` },
    ],
    ['src/a.ts', { 'src/a.ts': `import '../apps/web/src/sdk.js';`, ...sdkModule }],
    [
      'src/a.ts',
      {
        'src/a.ts': `await import('../apps/web/src/b');`,
        'apps/web/src/b.ts': `import './sdk';`,
        ...sdkModule,
      },
    ],
    ['apps/web/tests/a.test.ts', { 'apps/web/tests/a.test.ts': `import '@/sdk';`, ...sdkModule }],
    [
      'apps/website/site/.eleventy.js',
      { 'apps/website/site/.eleventy.js': `require('firebase/app');` },
    ],
  ])('flags %s', (entry, files) => {
    expect([...violations(fixture(files), stub).keys()]).toEqual([entry]);
  });

  it.each([
    ['firebase-admin', { 'src/a.ts': `import { getFirestore } from 'firebase-admin/firestore';` }],
    ['browser code', { 'apps/web/src/a.ts': `import { initializeApp } from 'firebase/app';` }],
    [
      'a website page script',
      { 'apps/website/site/src/js/a.js': `import { initializeApp } from 'firebase/app';` },
    ],
    [
      'a stubbed specifier in a web test',
      { 'apps/web/tests/a.test.ts': `await import('firebase/auth');` },
    ],
    [
      'a type-only import',
      { 'src/a.ts': `import type { X } from '../apps/web/src/sdk.js';`, ...sdkModule },
    ],
    [
      'a module replaced by a vi.mock factory',
      {
        'src/a.ts': `vi.mock('../apps/web/src/sdk.js', () => ({}));\nimport '../apps/web/src/sdk.js';`,
        ...sdkModule,
      },
    ],
  ])('allows %s', (_label, files) => {
    expect([...violations(fixture(files), stub)]).toEqual([]);
  });

  it('does not treat a vi.mock that loads the original as a replacement', () => {
    const files = {
      'src/a.ts': `vi.mock('../apps/web/src/sdk.js', async (importOriginal) => ({ ...(await importOriginal()) }));\nimport '../apps/web/src/sdk.js';`,
      ...sdkModule,
    };
    expect([...violations(fixture(files), stub).values()]).toEqual([
      'src/a.ts > apps/web/src/sdk.ts > firebase/firestore',
    ]);
  });
});
