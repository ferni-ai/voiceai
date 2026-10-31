/**
 * Where a path lives after a move, and repo paths in plain text (config, docs, Dockerfiles)
 * and markdown links rewritten to follow it. Used by move-module.ts.
 *
 * @module scripts/codemods/move-paths
 */
import { posix } from 'path';
import { specPath } from '../../apps/cli/src/commands/quality/module-specifiers.js';

export interface Move {
  from: string;
  to: string;
}

export const EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
export const strip = (p: string): string => p.replace(EXT, '');
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where repo path `p` lives after the moves (itself when untouched). */
export function mapPath(p: string, moves: Move[]): string {
  for (const { from, to } of moves) {
    if (p === from) return to;
    if (p.startsWith(`${from}/`)) return to + p.slice(from.length);
    if (
      EXT.test(from) &&
      strip(p) === strip(from) &&
      /^(\.(ts|tsx|js|mjs|cjs))?$/.test(p.slice(strip(from).length))
    ) {
      return strip(to) + p.slice(strip(from).length);
    }
  }
  return p;
}

/** Repo-relative path mentions in plain text (config, docs, Dockerfiles), bounded so
 * `apps/web/src/x` or `src/xy` never match `src/x`. */
export function rewriteText(text: string, moves: Move[], docker = false): string {
  for (const { from, to } of moves) {
    const pairs: Array<[string, string]> = [[from, to]];
    if (/\.tsx?$/.test(from)) pairs.push([`${strip(from)}.js`, `${strip(to)}.js`]);
    if (docker && from.startsWith('src/') && to.startsWith('src/'))
      pairs.push([`dist/${from.slice(4)}`, `dist/${to.slice(4)}`]);
    for (const [a, b] of pairs) {
      const re = new RegExp(
        `(?<=(?:^|[\\s'"\`(\\[{,=:!|>])(?:\\./|/app/|/)?)${esc(a)}(?=$|[\\s'"\`)\\]}/,:;>#?])`,
        'gm'
      );
      text = text.replace(re, b);
    }
  }
  return text;
}

export function rewriteLinks(
  file: string,
  text: string,
  moves: Move[],
  exists: (p: string) => boolean
): { text: string; n: number } {
  let n = 0;
  const out = text.replace(
    /\]\(([^)\s#]+)(#[^)\s]*)?(\s+"[^"]*")?\)/g,
    (all, target: string, anchor = '', title = '') => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) return all;
      const p = specPath(file, target);
      const [newFile, newP] = [mapPath(file, moves), mapPath(p, moves)];
      if ((newFile === file && newP === p) || !exists(p)) return all;
      let rel = posix.relative(posix.dirname(newFile), newP) || '.';
      if (target.startsWith('./') && !rel.startsWith('.')) rel = `./${rel}`;
      if (target.endsWith('/') && !rel.endsWith('/')) rel += '/';
      if (rel === target) return all;
      n++;
      return `](${rel}${anchor}${title})`;
    }
  );
  return { text: out, n };
}
