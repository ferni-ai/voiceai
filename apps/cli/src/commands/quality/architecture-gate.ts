#!/usr/bin/env npx tsx
/**
 * Architecture gate: every import in src/ (static, re-export, type-only, `import()`,
 * `require()`, read from the TypeScript AST) checked against architecture-layers.ts.
 * It replaces a line-regex validator that passed while missing multi-line imports,
 * `import()`, 15 unmapped dirs and same-layer cycles.
 *
 * Rules: `upward` (toward an outer layer), `core-to-platform` (L2/L3 → L1),
 * `context-internal` (past another context's index.ts), `orchestration-internal` (L4/L5
 * past a context's index.ts), `cycle` (inside any static import cycle). Type-only imports
 * follow the same rules under `type-*` keys.
 * It compares the change with its merge base (merge-base.ts): the graph is built for the
 * working tree AND the base commit, and only violations the diff adds fail. A moved file
 * keeps its edges (git rename detection), and an import moved from one changed file to
 * another is not new. The committed baseline is a scoreboard that never blocks.
 *   pnpm quality:arch            check (CI)
 *   pnpm quality:arch --update   drop fixed edges from the scoreboard (never adds)
 *
 * @module quality/architecture-gate
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'url';
import { CONTEXTS, LAYER_MAP, type Context, type Layer } from './architecture-layers.js';
import { diffAgainstBase, listAtBase, readAtBase, resolveBase, type BaseDiff } from './merge-base.js';

export const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'architecture-baseline.generated.json');
const RUNTIME_RULES = ['upward', 'core-to-platform', 'context-internal'] as const;
export const RULES = [
  ...RUNTIME_RULES,
  'type-upward',
  'type-core-to-platform',
  'type-context-internal',
  'cycle',
  'vendor',
  // Agents, session and API code reaching past a context's index.ts (1,767 runtime edges
  // on 2026-10-23, 90% of their imports into contexts): grandfathered, new ones fail.
  'orchestration-internal',
  'type-orchestration-internal',
] as const;
export type Rule = (typeof RULES)[number];
export type Baseline = Record<Rule, string[]>;

/** `lazy`: inside a function body, so it can't close a load-time cycle. */
export interface Edge { from: string; to: string; kind: 'static' | 'type' | 'dynamic' | 'require'; line: number; lazy: boolean }
/** `prefix`: the map key that matched; `<prefix>/index.ts` is a context's public API. */
export interface Placement { layer: Layer; context?: Context; prefix: string }
export interface Violation { rule: Rule; from: string; to: string; line: number }
/** A direct import of a vendor SDK package (`to` is the package name). */
export interface VendorImport { from: string; to: string; line: number }

/** Vendor SDKs that core (L2/L3) must reach through a port, not import (#1673). */
export const VENDOR_PACKAGES = ['firebase-admin', '@livekit/', 'livekit-server-sdk', '@google/genai', '@google/generative-ai', '@google-cloud/vertexai'];
const vendorOf = (spec: string): string | null => {
  const pkg = VENDOR_PACKAGES.find((p) => spec === p || spec.startsWith(p.endsWith('/') ? p : `${p}/`));
  if (!pkg) return null;
  const parts = spec.split('/'); // "@livekit/agents/dist" → "@livekit/agents"; "firebase-admin/app" → "firebase-admin"
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
};

const TEST = /(__tests__|__mocks__|\.(test|spec)\.tsx?$|^src\/(tests|e2e)\/)/;
const RANK: Record<Layer, number> = { L1: -1, L2: 0, L3: 1, L4: 2, L5: 3 };

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** A tree to build the graph from: the working tree, or a commit read through git. */
export interface SourceTree {
  files: string[];
  read: (file: string) => string;
  isFile: (file: string) => boolean;
}

function fsTree(root: string): SourceTree {
  return {
    files: walk(join(root, 'src'), []).map((f) => relative(root, f)),
    read: (f) => readFileSync(join(root, f), 'utf8'),
    isFile: (f) => existsSync(join(root, f)) && statSync(join(root, f)).isFile(),
  };
}

/** src/ as it was at `base`. */
export function gitTree(base: string, root: string): SourceTree {
  const all = listAtBase(base, ['src'], root);
  const files = all.filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts') && !/(^|\/)(node_modules|dist)\//.test(f));
  const texts = readAtBase(base, files.filter((f) => !TEST.test(f)), root);
  const present = new Set(all);
  return { files, read: (f) => texts.get(f) ?? '', isFile: (f) => present.has(f) };
}

function resolveSpec(root: string, from: string, spec: string, isFile: (file: string) => boolean): string | null {
  if (!spec.startsWith('.')) return null;
  const base = relative(root, resolve(root, dirname(from), spec)).replace(/\.(js|ts|mjs|cjs)$/, '');
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base].find(isFile) ?? null;
}

/** True when every name an import/export clause brings in is type-only. */
function typeOnly(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  const allTypes = (els?: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>): boolean =>
    !!els && els.length > 0 && els.every((e) => e.isTypeOnly);
  if (ts.isExportDeclaration(node)) {
    const c = node.exportClause;
    return node.isTypeOnly || (!!c && ts.isNamedExports(c) && allTypes(c.elements));
  }
  const c = node.importClause;
  const named = c?.namedBindings;
  return !!c && (c.isTypeOnly || (!c.name && !!named && ts.isNamedImports(named) && allTypes(named.elements)));
}

/** Every relative import between production files under src/, from the AST. */
export function buildGraph(root: string, tree: SourceTree = fsTree(root)): { files: string[]; edges: Edge[]; vendor: VendorImport[] } {
  const files = tree.files.filter((f) => !TEST.test(f));
  const edges: Edge[] = [];
  const vendor: VendorImport[] = [];
  for (const from of files) {
    const sf = ts.createSourceFile(from, tree.read(from), ts.ScriptTarget.Latest, true);
    const add = (spec: string, kind: Edge['kind'], node: ts.Node, lazy: boolean): void => {
      const to = resolveSpec(root, from, spec, tree.isFile);
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const pkg = vendorOf(spec);
      if (pkg) vendor.push({ from, to: pkg, line });
      if (to && !TEST.test(to)) edges.push({ from, to, kind, lazy, line });
    };
    const visit = (node: ts.Node, lazy: boolean): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        add(node.moduleSpecifier.text, typeOnly(node) ? 'type' : 'static', node, lazy);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const e = node.moduleReference.expression;
        if (ts.isStringLiteral(e)) add(e.text, node.isTypeOnly ? 'type' : 'static', node, lazy);
      } else if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        const callee = node.expression;
        if (callee.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0].text, 'dynamic', node, lazy);
        else if (ts.isIdentifier(callee) && callee.text === 'require') add(node.arguments[0].text, 'require', node, lazy);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        add(node.argument.literal.text, 'type', node, lazy);
      }
      ts.forEachChild(node, (child) => visit(child, lazy || ts.isFunctionLike(node)));
    };
    visit(sf, false);
  }
  return { files, edges, vendor };
}

/** Where a file sits (longest matching prefix); null when unassigned or unmapped. */
export function placementOf(file: string, map: Record<string, string> = LAYER_MAP): Placement | null {
  const prefix = Object.keys(map)
    .filter((p) => file === p || file.startsWith(`${p}/`))
    .reduce((best, p) => (p.length > best.length ? p : best), '');
  const value = prefix ? map[prefix] : undefined;
  if (!value || value === 'unassigned') return null;
  const [layer, context] = value.split(':') as [Layer, Context | undefined];
  return { layer, context, prefix };
}

/** The rule an import from `a` into file `to` (placed at `b`) breaks, if any. */
export function ruleFor(a: Placement, b: Placement, to: string): Rule | null {
  if (b.layer === 'L1') return a.layer === 'L2' || a.layer === 'L3' ? 'core-to-platform' : null;
  if (a.layer === 'L1') return b.layer === 'L4' || b.layer === 'L5' ? 'upward' : null; // L1 may implement L2/L3 ports
  if (RANK[b.layer] > RANK[a.layer]) return 'upward';
  if (b.layer !== 'L3') return null;
  // Orchestration may enter a context through any index.ts in it, a sub-folder's included.
  if (a.layer === 'L4' || a.layer === 'L5') return /(^|\/)index\.tsx?$/.test(to) ? null : 'orchestration-internal';
  const isPublic = [b.prefix, `${b.prefix}/index.ts`, `${b.prefix}/index.tsx`].includes(to);
  return a.layer === 'L3' && a.context !== b.context && !isPublic ? 'context-internal' : null;
}

/** Strongly connected components of 2+ files (iterative Tarjan: the graph is too deep to recurse). */
export function sccs(edges: Array<Pick<Edge, 'from' | 'to'>>): string[][] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from !== e.to) adj.set(e.from, adj.get(e.from) ?? []).get(e.from)!.push(e.to);
  }
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const out: string[][] = [];
  for (const start of adj.keys()) {
    if (index.has(start)) continue;
    const work: Array<{ v: string; i: number }> = [];
    const enter = (v: string): void => {
      const i = index.size;
      index.set(v, i);
      low.set(v, i);
      stack.push(v);
      onStack.add(v);
      work.push({ v, i: 0 });
    };
    enter(start);
    while (work.length > 0) {
      const top = work[work.length - 1]!;
      const w = (adj.get(top.v) ?? [])[top.i++];
      if (w !== undefined) {
        if (!index.has(w)) enter(w);
        else if (onStack.has(w)) low.set(top.v, Math.min(low.get(top.v)!, index.get(w)!));
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.v, Math.min(low.get(parent.v)!, low.get(top.v)!));
      if (low.get(top.v) !== index.get(top.v)) continue;
      const comp: string[] = [];
      for (let x = stack.pop()!; ; x = stack.pop()!) {
        onStack.delete(x);
        comp.push(x);
        if (x === top.v) break;
      }
      if (comp.length > 1) out.push(comp.sort());
    }
  }
  return out;
}

/** Load-time cycles: eager imports only (static, top-level require). */
export function cycles(edges: Edge[]): { components: string[][]; violations: Violation[] } {
  const eager = edges.filter((e) => e.kind === 'static' || (e.kind === 'require' && !e.lazy));
  const components = sccs(eager);
  const comp = new Map(components.flatMap((c, i) => c.map((f) => [f, i] as const)));
  const violations = eager
    .filter((e) => e.from !== e.to && comp.has(e.from) && comp.get(e.from) === comp.get(e.to))
    .map((e): Violation => ({ rule: 'cycle', from: e.from, to: e.to, line: e.line }));
  return { components, violations };
}

export const keyOf = (v: Violation): string => `${v.from} -> ${v.to}`;

/** Every violation, one per (rule, from, to); the first import line stands for the edge. */
export function check(graph: { edges: Edge[]; vendor?: VendorImport[] }, map: Record<string, string> = LAYER_MAP): Violation[] {
  const out = new Map<string, Violation>();
  const add = (v: Violation): Map<string, Violation> => out.set(`${v.rule}|${keyOf(v)}`, out.get(`${v.rule}|${keyOf(v)}`) ?? v);
  for (const e of graph.edges) {
    const a = placementOf(e.from, map);
    const b = placementOf(e.to, map);
    const rule = a && b ? ruleFor(a, b, e.to) : null;
    if (rule) add({ rule: e.kind === 'type' ? (`type-${rule}` as Rule) : rule, from: e.from, to: e.to, line: e.line });
  }
  cycles(graph.edges).violations.forEach(add);
  for (const v of graph.vendor ?? []) {
    const layer = placementOf(v.from, map)?.layer;
    if (layer === 'L2' || layer === 'L3') add({ rule: 'vendor', from: v.from, to: v.to, line: v.line });
  }
  return [...out.values()];
}

/** Sorted edge lists per rule, so a baseline diff reads one edge per line. */
export function toBaseline(violations: Violation[]): Baseline {
  const keys = (r: Rule): string[] => [...new Set(violations.filter((v) => v.rule === r).map(keyOf))].sort();
  return Object.fromEntries(RULES.map((r) => [r, keys(r)])) as Baseline;
}

/** New violations (not in the baseline), how many baseline edges are gone, and the lowered baseline. */
export function compare(base: Baseline, now: Violation[]): { added: Violation[]; fixed: number; lowered: Baseline } {
  const known = new Set(RULES.flatMap((r) => (base[r] ?? []).map((k) => `${r}|${k}`)));
  const current = new Set(now.map((v) => `${v.rule}|${keyOf(v)}`));
  const added = now.filter((v) => !known.has(`${v.rule}|${keyOf(v)}`));
  const lowered = Object.fromEntries(RULES.map((r) => [r, (base[r] ?? []).filter((k) => current.has(`${r}|${k}`))])) as Baseline;
  return { added, fixed: known.size - RULES.reduce((n, r) => n + lowered[r].length, 0), lowered };
}

/**
 * Violations in `head` the change added. A head violation is old when the base had the same
 * rule and edge under the files' base paths (`toBase` maps renames, null for a new file). An
 * edge the change removed from one file and added to another (a split, an extracted helper)
 * is moved, not new: removed (rule, target) pairs are consumed by added ones first.
 */
export function newViolations(head: Violation[], base: Violation[], toBase: (headPath: string) => string | null): Violation[] {
  const key = (rule: string, from: string, to: string): string => `${rule}|${from} -> ${to}`;
  const known = new Set(base.map((v) => key(v.rule, v.from, v.to)));
  const mapped = (v: Violation): { from: string | null; to: string | null } => ({
    from: toBase(v.from),
    to: v.rule === 'vendor' ? v.to : toBase(v.to),
  });
  const stillThere = new Set(
    head.map((v) => mapped(v)).flatMap((m, i) => (m.from && m.to ? [key(head[i]!.rule, m.from, m.to)] : []))
  );
  const removed = new Map<string, number>(); // `${rule}|${target}` → edges the change dropped
  for (const v of base) {
    if (stillThere.has(key(v.rule, v.from, v.to))) continue;
    const target = `${v.rule}|${v.to}`;
    removed.set(target, (removed.get(target) ?? 0) + 1);
  }
  return head.filter((v) => {
    const m = mapped(v);
    if (m.from && m.to && known.has(key(v.rule, m.from, m.to))) return false;
    const target = `${v.rule}|${m.to ?? v.to}`;
    const left = removed.get(target) ?? 0;
    if (left > 0) {
      removed.set(target, left - 1);
      return false;
    }
    return true;
  });
}

/** Where orchestration should enter instead: the nearest index.ts above the file, or a note that none exists. */
export function orchestrationHint(to: string, root: string, map: Record<string, string> = LAYER_MAP): string {
  const prefix = placementOf(to, map)?.prefix ?? dirname(to);
  const lines = (f: string): number => readFileSync(join(root, f), 'utf8').split('\n').length;
  for (let dir = dirname(to); dir.length >= prefix.length; dir = dirname(dir)) {
    const entry = [`${dir}/index.ts`, `${dir}/index.tsx`].find((f) => existsSync(join(root, f)));
    if (!entry) continue;
    if (dir === dirname(to)) return `import ${entry} instead (export what you need there)`;
    const own = `${dirname(to)}/index.ts`;
    return dir === prefix
      ? `${dirname(to)}/ has no index.ts and the nearest entry is the ${lines(entry)}-line ${entry}: add ${own} exporting what you need, and import that`
      : `${dirname(to)}/ has no index.ts; import the nearest entry, ${entry}, or add ${own}`;
  }
  return `no index.ts between ${dirname(to)}/ and ${prefix}/: add ${dirname(to)}/index.ts exporting what you need`;
}

const HINT: Record<string, string> = {
  upward: 'move the code down a layer, or have the caller pass it in',
  'core-to-platform': 'depend on a port (interface) in L2/L3 and let L4 hand in the adapter',
  'context-internal': "import the other context's index.ts, or publish a domain event",
  'orchestration-internal': "import the context's index.ts (export what you need there), or ask it through a published query",
  cycle: 'import siblings directly instead of the barrel, or invert one edge',
  vendor: 'depend on a port (interface) in L2/L3 and have an L1 adapter implement it (#1673)',
};

/** Markdown scoreboard: unique violating edges per layer pair and per context, cycles, unassigned. */
export function scoreboard(files: string[], edges: Edge[], violations: Violation[], map = LAYER_MAP): string {
  const place = (f: string): Placement | null => placementOf(f, map);
  const pairs = new Map<string, [number, number]>();
  const ctx = new Map<string, number[]>(CONTEXTS.map((c) => [c, [0, 0, 0, 0, 0, 0]]));
  for (const c of files.map((f) => place(f)?.context)) if (c) ctx.get(c)![0]++;
  const edgeViolations = violations.filter((x) => x.rule !== 'cycle' && x.rule !== 'vendor');
  for (const v of edgeViolations) {
    const type = v.rule.startsWith('type-');
    const pair = `${place(v.from)!.layer} → ${place(v.to)!.layer}`;
    pairs.set(pair, pairs.get(pair) ?? [0, 0]).get(pair)![type ? 1 : 0]++;
    if (v.rule === 'orchestration-internal') ctx.get(place(v.to)!.context!)![5]++;
    const c = place(v.from)!.context;
    if (c) ctx.get(c)![type ? 4 : 1 + RUNTIME_RULES.indexOf(v.rule as (typeof RUNTIME_RULES)[number])]++;
  }
  const out = ['| Layer pair | runtime | type-only |', '|---|---:|---:|'];
  for (const [pair, [r, t]] of [...pairs].sort()) out.push(`| ${pair} | ${r} | ${t} |`);
  out.push(
    '',
    '| L3 context | files | upward | → L1 | other context internals | type-only | L4/L5 past its index |',
    '|---|---:|---:|---:|---:|---:|---:|'
  );
  for (const [c, n] of ctx) out.push(`| ${c} | ${n.join(' | ')} |`);
  const { components } = cycles(edges);
  const largest = (cs: string[][]): number => Math.max(0, ...cs.map((c) => c.length));
  const lazy = sccs(edges.filter((e) => e.kind !== 'type'));
  const unassigned = new Map<string, number>();
  for (const parts of files.filter((f) => !place(f)).map((f) => f.split('/'))) {
    const dir = parts.slice(0, parts.length > 3 ? 3 : 2).join('/'); // loose files count toward their dir
    unassigned.set(dir, (unassigned.get(dir) ?? 0) + 1);
  }
  const top = [...unassigned].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, n]) => `${d} ${n}`);
  out.push(
    '',
    `Cycles: ${components.length} static import cycles over ${components.reduce((n, c) => n + c.length, 0)} files ` +
      `(${violations.filter((v) => v.rule === 'cycle').length} edges, largest ${largest(components)} files). With lazy ` +
      `\`import()\`/\`require()\` the largest cycle spans ${largest(lazy)} files (reported, not gated).`,
    `Unassigned, not checked: ${files.filter((f) => !place(f)).length} of ${files.length} files (${top.join(', ')}).`,
    `Vendor SDK imports in L2/L3 (must go through a port): ${violations.filter((v) => v.rule === 'vendor').length} files-to-package edges.`
  );
  return out.join('\n');
}

function main(args: string[]): void {
  const say = (text: string): boolean => process.stdout.write(`${text}\n`); // ci-quality-gates counts console calls
  const root = process.cwd();
  const started = Date.now();
  const graph = buildGraph(root);
  const now = check(graph);
  const board = scoreboard(graph.files, graph.edges, now);
  say(`${board}\n\nScanned ${graph.files.length} files, ${graph.edges.length} imports in ${Date.now() - started} ms.`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Architecture gate\n\n${board}\n`);

  const base = resolveBase(root);
  const atBase = Date.now();
  const diff: BaseDiff = diffAgainstBase(base, ['src'], root);
  const before = check(buildGraph(root, gitTree(base, root)));
  const added = newViolations(now, before, (p) => (diff.added.has(p) ? null : (diff.renamedFrom.get(p) ?? p)));
  say(`Base ${base.slice(0, 9)}: ${before.length} violations there, ${now.length} here; ${diff.changed.length} changed files (${Date.now() - atBase} ms).`);

  // The committed baseline is a scoreboard: --update lowers it; it never blocks.
  const scored = existsSync(BASELINE) ? compare(JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline, now) : null;
  if (scored && args.includes('--update')) writeFileSync(BASELINE, JSON.stringify(scored.lowered, null, 1) + '\n');
  if (added.length > 0) {
    say(`\n❌ ${added.length} architecture violation(s) added by this change:`);
    for (const v of added.slice(0, 60)) {
      const fix = v.rule.endsWith('orchestration-internal') ? orchestrationHint(v.to, root) : HINT[v.rule.replace('type-', '')];
      say(`  ${v.rule}  ${v.from}:${v.line} -> ${v.to}\n      fix: ${fix}`);
    }
    if (added.length > 60) say(`  … and ${added.length - 60} more`);
    say('\nLayer map: apps/cli/src/commands/quality/architecture-layers.ts (owners review changes to it).');
    process.exit(1);
  }
  const fixed = scored?.fixed ?? 0;
  const msg = args.includes('--update') ? `${fixed} fixed edge(s) removed from the scoreboard.` : `${fixed} scoreboard edge(s) fixed: \`pnpm quality:arch --update\` records it.`;
  say(`\n✅ No architecture violations added.${fixed > 0 ? ` ${msg}` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
