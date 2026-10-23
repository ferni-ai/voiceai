/**
 * The size part of the quality ratchet, measured against the merge base (merge-base.ts):
 * for each source file a change touches, compare it with its base version (its old path
 * when moved) and fail only on what the change adds.
 *
 * - a new file over 300 lines (a moved file is not new);
 * - a file over 500 lines that grew, or one that crossed 500;
 * - a function over 150 lines that is new, crossed 150, or grew by more than
 *   max(5 lines, 2%) in this change (the god functions can take a small fix, not a feature).
 *   A function that left one touched (or deleted) file for another is judged against its
 *   old size there, so moving or splitting out a god function is free;
 * - more `as unknown as` casts across the touched files than at the base (moving one is free).
 *
 * The size ratchet had measured files against a committed list, which went stale within
 * hours and was met by deletion and cap-hugging (code-health 2026-10-23, complexity.md).
 *
 * @module quality/size-diff
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { basePathOf, diffAgainstBase, readAtBase, resolveBase } from './merge-base.js';

export const FILE_MAX_LINES = 500;
export const NEW_FILE_MAX_LINES = 300;
export const MAX_FUNCTION_LINES = 150;

/** How much a function already over the limit may grow in one change. */
export const allowedGrowth = (before: number): number => Math.max(5, Math.ceil(before * 0.02));

const lineCount = (text: string): number => (text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0);

/** Double casts through unknown, from the AST: comments and strings that mention one don't count. */
export function countAsUnknownAs(text: string, file = 'x.ts'): number {
  if (!/\bunknown\b/.test(text)) return 0;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let n = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.UnknownKeyword && ts.isAsExpression(node.parent)) n++;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/** `Class.method`, `outer.inner`, the variable or property a function is assigned to, or `<anonymous>`. */
function functionName(node: ts.Node): string {
  const own = (node as ts.Node & { name?: ts.Node }).name;
  if (own && (ts.isIdentifier(own) || ts.isStringLiteral(own) || ts.isPrivateIdentifier(own))) return own.text;
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  const p = node.parent;
  const holder = p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) ? p.name : undefined;
  return holder && (ts.isIdentifier(holder) || ts.isStringLiteral(holder)) ? holder.text : '<anonymous>';
}

/** Functions over MAX_FUNCTION_LINES in one file, keyed by qualified name (a repeat gets `~2`, `~3`). */
export function longFunctions(file: string, text: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (lineCount(text) <= MAX_FUNCTION_LINES) return out; // no function is longer than its file
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line;
  const visit = (node: ts.Node, scope: string[]): void => {
    let inner = scope;
    if (ts.isClassLike(node)) inner = [...scope, node.name?.text ?? '<class>'];
    if (ts.isFunctionLike(node) && 'body' in node && node.body) {
      inner = [...scope, functionName(node)];
      const lines = lineOf(node.getEnd()) - lineOf(node.getStart(sf)) + 1;
      if (lines > MAX_FUNCTION_LINES) {
        const key = inner.join('.');
        let unique = key;
        for (let n = 2; unique in out; n++) unique = `${key}~${n}`;
        out[unique] = lines;
      }
    }
    ts.forEachChild(node, (child) => visit(child, inner));
  };
  visit(sf, []);
  return out;
}

/** One touched file: its text here and at the base (null when the file is new). */
export interface FileChange {
  path: string;
  head: string;
  base: string | null;
}

/** A file the change deletes, with its base text. */
export interface Removed {
  path: string;
  base: string;
}

/** `Turn.run~2` → `run`: the name a function keeps when it moves out of a class or outer function. */
const leaf = (key: string): string => key.replace(/~\d+$/, '').split('.').pop() ?? key;

/**
 * Long functions that left their base file in this change (gone from it, or the file deleted),
 * to be matched once each by a long function that appears in another file.
 */
function movedOutPool(changes: FileChange[], removed: Removed[]): Array<{ key: string; lines: number; from: string }> {
  const pool: Array<{ key: string; lines: number; from: string }> = [];
  const add = (from: string, base: string, head: Record<string, number>): void => {
    for (const [key, lines] of Object.entries(longFunctions(from, base))) if (!(key in head)) pool.push({ key, lines, from });
  };
  for (const c of changes) if (c.base !== null) add(c.path, c.base, longFunctions(c.path, c.head));
  for (const r of removed) add(r.path, r.base, {});
  return pool;
}

/** What the change adds, as messages; empty when it may land. */
export function sizeRegressions(changes: FileChange[], removed: Removed[] = []): string[] {
  const out: string[] = [];
  const pool = movedOutPool(changes, removed);
  /** Take the old size of a function moved here: same qualified name first, then same leaf name. */
  const takeMoved = (path: string, key: string): { lines: number; from: string } | undefined => {
    let i = pool.findIndex((p) => p.key === key && p.from !== path);
    if (i < 0) i = pool.findIndex((p) => leaf(p.key) === leaf(key) && p.from !== path);
    return i < 0 ? undefined : pool.splice(i, 1)[0];
  };
  let castsNow = 0;
  let castsBefore = 0;
  for (const c of changes) {
    const lines = lineCount(c.head);
    const before = c.base === null ? null : lineCount(c.base);
    if (before === null && lines > NEW_FILE_MAX_LINES) {
      out.push(`${c.path}: ${lines} lines in a new file, over the ${NEW_FILE_MAX_LINES}-line cap for new files. Split it.`);
    } else if (before !== null && lines > FILE_MAX_LINES && lines > before) {
      out.push(
        before > FILE_MAX_LINES
          ? `${c.path}: grew ${before} → ${lines} lines. Files over ${FILE_MAX_LINES} lines may not grow; split or shrink it.`
          : `${c.path}: ${before} → ${lines} lines, over the ${FILE_MAX_LINES}-line limit. Split it.`
      );
    }
    const fnsBefore = c.base === null ? {} : longFunctions(c.path, c.base);
    for (const [fn, n] of Object.entries(longFunctions(c.path, c.head))) {
      const moved = fn in fnsBefore ? undefined : takeMoved(c.path, fn);
      const was = fnsBefore[fn] ?? moved?.lines;
      const from = moved ? ` (moved from ${moved.from})` : '';
      if (was === undefined) {
        out.push(`${c.path}#${fn}: ${n} lines, over the ${MAX_FUNCTION_LINES}-line function limit (new or newly over). Extract steps.`);
      } else if (n - was > allowedGrowth(was)) {
        out.push(`${c.path}#${fn}: grew ${was} → ${n} lines${from}; a function over ${MAX_FUNCTION_LINES} lines may grow by ${allowedGrowth(was)} per change. Extract steps.`);
      }
    }
    castsNow += countAsUnknownAs(c.head, c.path);
    castsBefore += c.base === null ? 0 : countAsUnknownAs(c.base, c.path);
  }
  for (const r of removed) castsBefore += countAsUnknownAs(r.base, r.path); // a cast moved out of a deleted file
  if (castsNow > castsBefore) {
    out.push(`\`as unknown as\` casts in the touched files rose ${castsBefore} → ${castsNow}. Type it, or narrow with a guard.`);
  }
  return out;
}

/** The touched source files under `roots`, with their base versions. */
export function changedSources(roots: string[], isSource: (path: string) => boolean, root = process.cwd()): { base: string; changes: FileChange[]; removed: Removed[] } {
  const base = resolveBase(root);
  const diff = diffAgainstBase(base, roots, root);
  const files = diff.changed.filter(isSource);
  const deleted = diff.deleted.filter(isSource);
  const texts = readAtBase(base, [...files.map((f) => basePathOf(diff, f)).filter((p): p is string => p !== null), ...deleted], root);
  const changes = files.map((path) => {
    const old = basePathOf(diff, path);
    return { path, head: readFileSync(join(root, path), 'utf8'), base: old === null ? null : (texts.get(old) ?? null) };
  });
  const removed = deleted.flatMap((path) => {
    const text = texts.get(path);
    return text === undefined ? [] : [{ path, base: text }];
  });
  return { base, changes, removed };
}
