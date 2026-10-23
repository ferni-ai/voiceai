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
 * A ratchet: the baseline lists today's edges; a new edge fails, a fixed one passes.
 *   pnpm quality:arch            check (CI)
 *   pnpm quality:arch --update   drop fixed edges from the baseline (never adds)
 *   pnpm quality:arch --init     record every current edge (review sees the diff)
 *
 * @module quality/architecture-gate
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'url';
import { CONTEXTS, LAYER_MAP, type Context, type Layer } from './architecture-layers.js';

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

function resolveSpec(root: string, from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(root, dirname(from), spec).replace(/\.(js|ts|mjs|cjs)$/, '');
  const hit = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base].find(
    (c) => existsSync(c) && statSync(c).isFile()
  );
  return hit ? relative(root, hit) : null;
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
export function buildGraph(root: string): { files: string[]; edges: Edge[]; vendor: VendorImport[] } {
  const files = walk(join(root, 'src'), []).map((f) => relative(root, f)).filter((f) => !TEST.test(f));
  const edges: Edge[] = [];
  const vendor: VendorImport[] = [];
  for (const from of files) {
    const sf = ts.createSourceFile(from, readFileSync(join(root, from), 'utf8'), ts.ScriptTarget.Latest, true);
    const add = (spec: string, kind: Edge['kind'], node: ts.Node, lazy: boolean): void => {
      const to = resolveSpec(root, from, spec);
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
  const isPublic = [b.prefix, `${b.prefix}/index.ts`, `${b.prefix}/index.tsx`].includes(to);
  if (b.layer !== 'L3' || isPublic) return null;
  if (a.layer === 'L4' || a.layer === 'L5') return 'orchestration-internal';
  return a.layer === 'L3' && a.context !== b.context ? 'context-internal' : null;
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
  const started = Date.now();
  const graph = buildGraph(process.cwd());
  const now = check(graph);
  const board = scoreboard(graph.files, graph.edges, now);
  const write = (b: Baseline): void => writeFileSync(BASELINE, JSON.stringify(b, null, 1) + '\n');
  say(`${board}\n\nScanned ${graph.files.length} files, ${graph.edges.length} imports in ${Date.now() - started} ms.`);
  if (args.includes('--init')) return write(toBaseline(now));
  if (!existsSync(BASELINE)) throw new Error(`No baseline at ${BASELINE}: run with --init`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Architecture gate\n\n${board}\n`);
  const { added, fixed, lowered } = compare(JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline, now);
  if (args.includes('--update')) write(lowered);
  if (added.length > 0) {
    say(`\n❌ ${added.length} new architecture violation(s), not in the baseline:`);
    for (const v of added.slice(0, 60)) {
      say(`  ${v.rule}  ${v.from}:${v.line} -> ${v.to}\n      fix: ${HINT[v.rule.replace('type-', '')]}`);
    }
    if (added.length > 60) say(`  … and ${added.length - 60} more`);
    say('\nLayer map: apps/cli/src/commands/quality/architecture-layers.ts. Moved files on purpose? Run with --init; review sees the baseline diff.');
    process.exit(1);
  }
  const msg = args.includes('--update') ? `${fixed} fixed edge(s) removed from the baseline.` : `${fixed} baseline edge(s) fixed: run \`pnpm quality:arch --update\` to lock that in.`;
  say(`\n✅ No new architecture violations.${fixed > 0 ? ` ${msg}` : ''}`);
  if (fixed > 0 && process.env.GITHUB_ACTIONS) say(`::notice title=Architecture gate::${msg}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
