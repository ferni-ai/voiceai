/**
 * Full import graph of apps/web/src, built with the TypeScript compiler.
 *
 * ArchUnitTS (the primary engine for the architecture tests) only records
 * top-level `import ... from` declarations. This graph also records
 * `export ... from` re-exports and dynamic `import()` calls, so the same layer
 * rules can be applied to the edges ArchUnitTS cannot see.
 */

import { readFileSync } from 'fs';
import { dirname, join, relative, resolve, sep } from 'path';

import ts from 'typescript';

export type EdgeKind = 'import' | 're-export' | 'dynamic';

export interface ModuleEdge {
  /** Importing file, relative to apps/web (e.g. `src/ui/foo.ui.ts`). */
  readonly source: string;
  /** Imported file, relative to apps/web; may start with `../` when outside it. */
  readonly target: string;
  /** The specifier as written in source. */
  readonly specifier: string;
  readonly kind: EdgeKind;
}

export interface ModuleGraph {
  readonly webRoot: string;
  /** Every `.ts` file the web tsconfig compiles, relative to apps/web. */
  readonly files: readonly string[];
  /** Edges to files in the repo, including workspace packages; node_modules excluded. */
  readonly edges: readonly ModuleEdge[];
}

export const WEB_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..', '..');

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function collectSpecifiers(sourceFile: ts.SourceFile): Array<{ specifier: string; kind: EdgeKind }> {
  const found: Array<{ specifier: string; kind: EdgeKind }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, kind: 'import' });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push({ specifier: node.moduleSpecifier.text, kind: 're-export' });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push({ specifier: node.arguments[0].text, kind: 'dynamic' });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * Strongly connected components with more than one file (Tarjan), i.e. groups
 * of files that import each other in a loop. Each group is sorted.
 */
export function findCycles(edges: readonly ModuleEdge[]): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const { source, target } of edges) {
    if (source === target) continue;
    const targets = adjacency.get(source) ?? new Set<string>();
    targets.add(target);
    adjacency.set(source, targets);
  }

  let nextIndex = 0;
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const groups: string[][] = [];

  const connect = (node: string): void => {
    index.set(node, nextIndex);
    lowLink.set(node, nextIndex);
    nextIndex++;
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) ?? []) {
      if (!index.has(next)) {
        connect(next);
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, lowLink.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, index.get(next) ?? 0));
      }
    }

    if (lowLink.get(node) === index.get(node)) {
      const group: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        group.push(member);
      } while (member !== node);
      if (group.length > 1) groups.push(group.sort());
    }
  };

  for (const node of adjacency.keys()) {
    if (!index.has(node)) connect(node);
  }
  return groups;
}

let cached: ModuleGraph | undefined;

/** Builds (once per test run) the full module graph for apps/web/src. */
export function getModuleGraph(): ModuleGraph {
  if (cached) return cached;

  const configPath = join(WEB_ROOT, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, WEB_ROOT);
  const host = ts.createCompilerHost(parsed.options);

  const files = parsed.fileNames.filter((file) => !file.endsWith('.d.ts'));
  const edges: ModuleEdge[] = [];

  for (const file of files) {
    const sourceFile = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const { specifier, kind } of collectSpecifiers(sourceFile)) {
      const resolved = ts.resolveModuleName(specifier, file, parsed.options, host).resolvedModule;
      // Workspace packages resolve through their symlink to a real path outside
      // node_modules; keep those so imports of backend code are still visible.
      if (!resolved || resolved.resolvedFileName.includes('/node_modules/')) continue;
      edges.push({
        source: toPosix(relative(WEB_ROOT, file)),
        target: toPosix(relative(WEB_ROOT, resolved.resolvedFileName)),
        specifier,
        kind,
      });
    }
  }

  cached = {
    webRoot: WEB_ROOT,
    files: files.map((file) => toPosix(relative(WEB_ROOT, file))),
    edges,
  };
  return cached;
}
