/**
 * Advisory duplicate check (#3523): for each exported function a change adds or edits, names
 * the closest existing export by two scores. Embedding: cosine of a local model over the
 * name's words and the code, run in-process, no external API. Shingles: Jaccard of 5-token
 * AST shingles with identifiers and literals blanked, for copies with renames. Thresholds
 * come from the dev set and are never retuned after the sealed run. The CI job only posts a
 * PR comment; it becomes a gate in a follow-up, once sealed precision is at least 0.9.
 *
 * @module quality/semantic-duplicates
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import ts from 'typescript';
import { basePathOf, diffAgainstBase, readAtBase, resolveBase } from './merge-base.js';

export const MODEL = 'Xenova/bge-small-en-v1.5';
/** Chosen on the dev set (precision 15/16, recall 15/17); never retuned after the sealed run. */
export const THRESHOLDS = { cosine: 0.96, jaccard: 0.9 };
/** Smaller functions (one-line getters, guards) are skipped: their likeness is noise. */
export const MIN_TOKENS = 40;
const SHINGLE = 5;
const MAX_CHARS = 1200;
export const SOURCES = ['src', 'apps', 'scripts'];
const NOT_SOURCE =
  /(^|\/)(__tests__|fixtures|node_modules)\/|\.(test|spec)\.ts$|\.d\.ts$|generated/;

export interface ExportedFn {
  file: string;
  name: string;
  line: number;
  code: string;
  tokens: string[];
}
export type Embed = (texts: string[]) => Promise<Float32Array[]>;
export type Match = { fn: ExportedFn; score: number };
export type Finding = { fn: ExportedFn; cosine?: Match; jaccard?: Match };
type CacheMeta = { model: string; dim: number; keys: string[] };

export const isSource = (file: string): boolean =>
  /\.ts$/.test(file) && SOURCES.some((d) => file.startsWith(`${d}/`)) && !NOT_SOURCE.test(file);

const exported = (s: ts.Node): boolean =>
  ts.canHaveModifiers(s) &&
  (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** Leaf tokens of `node`, identifiers and literals blanked, so a rename doesn't change them. */
export function codeTokens(node: ts.Node, sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const walk = (n: ts.Node): void => {
    const kids = n.getChildren(sf);
    if (kids.length > 0) return kids.forEach(walk);
    if (n.kind === ts.SyntaxKind.EndOfFileToken) return;
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) out.push('id');
    else if (ts.isLiteralExpression(n) || ts.isTemplateLiteralToken(n)) out.push('lit');
    else out.push(String(n.kind));
  };
  walk(node);
  return out;
}

/** Top-level exported functions with a body: `export function f`, `export const f = () =>`. */
export function exportedFunctions(file: string, text: string): ExportedFn[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: ExportedFn[] = [];
  const add = (name: string, node: ts.Node): void => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    out.push({ file, name, line, code: node.getText(sf), tokens: codeTokens(node, sf) });
  };
  for (const s of sf.statements) {
    if (!exported(s)) continue;
    if (ts.isFunctionDeclaration(s) && s.body) add(s.name?.text ?? 'default', s);
    if (!ts.isVariableStatement(s)) continue;
    for (const d of s.declarationList.declarations) {
      const init = d.initializer;
      const fn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
      if (fn && ts.isIdentifier(d.name)) add(d.name.text, d);
    }
  }
  return out;
}

export const sized = (fn: ExportedFn): boolean => fn.tokens.length >= MIN_TOKENS;

export function shingles(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= tokens.length; i++)
    out.add(tokens.slice(i, i + SHINGLE).join(' '));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let both = 0;
  for (const s of a) if (b.has(s)) both++;
  const either = a.size + b.size - both;
  return either === 0 ? 0 : both / either;
}

/** Dot product of two L2-normalised vectors. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

/** What the model reads: the name split into words, then the code. */
export const embedText = (fn: ExportedFn): string =>
  `${fn.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()}: ${fn.code}`.slice(0, MAX_CHARS);

const calls = (a: ExportedFn, b: ExportedFn): boolean =>
  a.name !== b.name &&
  new RegExp(`(^|[^\\w$])${b.name.replace(/\$/g, '\\$')}\\s*[(<]`).test(a.code);

/**
 * Pairs that are never reported: the same export, two in one file (siblings, inverses, one vs
 * all: the author already sees them), or one calling the other (a wrapper, not a copy).
 */
export const related = (a: ExportedFn, b: ExportedFn): boolean =>
  a.file === b.file || calls(a, b) || calls(b, a);

/**
 * For each candidate, the closest other export in `pool` by each score, kept when it reaches
 * its threshold. Related pairs (see `related`) are skipped.
 */
export function findDuplicates(
  candidates: ExportedFn[],
  pool: ExportedFn[],
  vectors: Map<ExportedFn, Float32Array>,
  thresholds = THRESHOLDS
): Finding[] {
  const poolShingles = new Map(pool.map((p) => [p, shingles(p.tokens)]));
  const findings: Finding[] = [];
  for (const fn of candidates.filter(sized)) {
    const mine = shingles(fn.tokens);
    const v = vectors.get(fn);
    let bestCos: Match | undefined;
    let bestJac: Match | undefined;
    for (const p of pool) {
      if (related(fn, p) || !sized(p)) continue;
      const pv = vectors.get(p);
      const c = v && pv ? cosine(v, pv) : 0;
      if (c >= thresholds.cosine && c > (bestCos?.score ?? 0)) bestCos = { fn: p, score: c };
      const j = jaccard(mine, poolShingles.get(p) ?? new Set());
      if (j >= thresholds.jaccard && j > (bestJac?.score ?? 0)) bestJac = { fn: p, score: j };
    }
    if (bestCos || bestJac) findings.push({ fn, cosine: bestCos, jaccard: bestJac });
  }
  return findings;
}

const textHash = (text: string): string =>
  createHash('sha1').update(`${MODEL}\n${text}`).digest('hex');

/** Embeds `fns` through `embed`, reusing vectors cached by content hash in `cachePath`. */
export async function embedAll(
  fns: ExportedFn[],
  embed: Embed,
  cachePath?: string
): Promise<Map<ExportedFn, Float32Array>> {
  const cache = new Map<string, Float32Array>();
  if (cachePath && existsSync(`${cachePath}.json`) && existsSync(`${cachePath}.bin`)) {
    const meta = JSON.parse(readFileSync(`${cachePath}.json`, 'utf8')) as CacheMeta;
    const buf = readFileSync(`${cachePath}.bin`);
    const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    if (meta.model === MODEL)
      meta.keys.forEach((k, i) => cache.set(k, all.slice(i * meta.dim, (i + 1) * meta.dim)));
  }
  const missing = [...new Set(fns.filter(sized).map(embedText))].filter(
    (t) => !cache.has(textHash(t))
  );
  for (let i = 0; i < missing.length; i += 32) {
    const batch = missing.slice(i, i + 32);
    const vs = await embed(batch);
    batch.forEach((t, j) => cache.set(textHash(t), vs[j] as Float32Array));
  }
  if (cachePath && missing.length > 0) {
    const keys = [...cache.keys()];
    const dim = cache.get(keys[0] as string)?.length ?? 0;
    const all = new Float32Array(keys.length * dim);
    keys.forEach((k, i) => all.set(cache.get(k) as Float32Array, i * dim));
    writeFileSync(`${cachePath}.json`, JSON.stringify({ model: MODEL, dim, keys }));
    writeFileSync(`${cachePath}.bin`, Buffer.from(all.buffer));
  }
  const out = new Map<ExportedFn, Float32Array>();
  for (const fn of fns.filter(sized)) {
    const v = cache.get(textHash(embedText(fn)));
    if (v) out.set(fn, v);
  }
  return out;
}

/** The local model as an Embed. Loaded lazily, so tests and the shingle path never load it. */
export async function localEmbed(): Promise<Embed> {
  const { env, pipeline } = await import('@huggingface/transformers');
  // CI caches the model next to the vectors; locally it lands in transformers' own cache.
  if (process.env.SEMANTIC_DUPS_MODEL_DIR) env.cacheDir = process.env.SEMANTIC_DUPS_MODEL_DIR;
  const extract = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  return async (texts) => {
    const rows = (
      await extract(texts, { pooling: 'mean', normalize: true })
    ).tolist() as number[][];
    return rows.map((r) => Float32Array.from(r));
  };
}

/** Every exported function in the tracked source files at `root`. */
export function poolAt(root: string): ExportedFn[] {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...SOURCES], { cwd: root });
  const files = listed
    .toString()
    .split('\0')
    .filter((f) => isSource(f) && existsSync(`${root}/${f}`));
  return files.flatMap((f) => exportedFunctions(f, readFileSync(`${root}/${f}`, 'utf8')));
}

/** Exports the change adds, or whose code it edits, measured against `base`. */
export function changedExports(base: string, root: string): ExportedFn[] {
  const diff = diffAgainstBase(base, SOURCES, root);
  const files = diff.changed.filter(isSource);
  const basePaths = files.map((f) => basePathOf(diff, f)).filter((p): p is string => p !== null);
  const atBase = readAtBase(base, basePaths, root);
  return files.flatMap((f) => {
    const bp = basePathOf(diff, f);
    const before = new Map(
      exportedFunctions(f, (bp && atBase.get(bp)) ?? '').map((e) => [e.name, e.code])
    );
    return exportedFunctions(f, readFileSync(`${root}/${f}`, 'utf8')).filter(
      (e) => before.get(e.name) !== e.code
    );
  });
}

export const NONE = new Float32Array(0);
export const MARKER = '<!-- semantic-duplicates -->';

/** The PR comment: one line per finding, naming the match. */
export function report(findings: Finding[], candidates: number): string {
  const at = (fn: ExportedFn): string => `\`${fn.name}\` (${fn.file}:${fn.line})`;
  const lines = findings.map((f) => {
    const parts = [
      f.cosine && `embedding ${f.cosine.score.toFixed(3)} with ${at(f.cosine.fn)}`,
      f.jaccard && `shingles ${f.jaccard.score.toFixed(2)} with ${at(f.jaccard.fn)}`,
    ].filter(Boolean);
    return `- ${at(f.fn)}: ${parts.join('; ')}`;
  });
  const of = `${candidates} new or changed exported functions`;
  if (findings.length === 0) return `${MARKER}\nNo likely duplicates in ${of} (advisory, #3523).`;
  const head = `**Possible duplicates** (advisory, #3523): ${findings.length} of ${of} look like an existing export.`;
  const tail = 'If one does the same job, call it instead; if not, ignore this.';
  return [MARKER, `${head} ${tail}`, '', ...lines].join('\n');
}

async function main(argv: string[]): Promise<void> {
  const arg = (name: string): string | undefined =>
    argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined;
  const root = process.cwd();
  const cache = arg('--cache');
  const embed = await localEmbed();
  const pool = poolAt(root);
  const candidates = argv.includes('--warm') ? [] : changedExports(resolveBase(root), root);
  const started = Date.now();
  const vectors = await embedAll([...pool, ...candidates], embed, cache);
  const findings = findDuplicates(candidates, pool, vectors);
  const body = report(findings, candidates.length);
  const out = arg('--out');
  if (out) writeFileSync(out, `${body}\n`);
  console.log(body);
  console.error(`${pool.length} exports, ${vectors.size} embedded, ${Date.now() - started} ms`);
}

if (process.argv[1]?.endsWith('semantic-duplicates.ts')) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
