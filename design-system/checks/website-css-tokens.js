/**
 * Website stylesheet token check (used by check-brand.js).
 *
 * Every hand-written stylesheet of the Eleventy portals
 * (apps/website/<portal>/src/css/**) must take its colors from the generated
 * token CSS:
 *   - no hex / rgb() / hsl() literals (comments and url() excepted); use
 *     var(--token), or color-mix(in srgb, var(--token) N%, transparent) for
 *     translucency (white/black are --color-white / --color-black)
 *   - no top-level :root/html block may redefine a generated token name, which
 *     is how local copies used to drift from the generated values (spacing is
 *     exempt: ferni-website pins the --space-* scale to px because its root
 *     font-size is 15px)
 *
 * The generated files themselves (_tokens.css, tokens.css) are skipped.
 */

import fs from 'fs';
import path from 'path';

const PORTALS_DIR = 'apps/website';
const GENERATED = /(^|\/)(_tokens|tokens)\.css$/;
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[\d.]/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

/** Custom property names defined at the top of a generated token file's :root. */
function generatedNames(file) {
  const src = fs.readFileSync(file, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  const root = src.slice(0, src.indexOf('\n}'));
  return new Set([...root.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

/** Top-level `:root { … }` / `html { … }` bodies (not nested in @media etc.). */
function topLevelRootBlocks(src) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  let selector = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      if (depth === 0) {
        const prev = src.lastIndexOf('}', i);
        selector = src.slice(prev + 1, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && /^(:root|html)$/.test(selector)) blocks.push(src.slice(start, i));
    }
  }
  return blocks;
}

export function checkWebsiteCssTokens(root) {
  const issues = [];
  const portalsDir = path.join(root, PORTALS_DIR);
  if (!fs.existsSync(portalsDir)) return issues;
  for (const portal of fs.readdirSync(portalsDir, { withFileTypes: true })) {
    if (!portal.isDirectory()) continue;
    const cssDir = path.join(portalsDir, portal.name, 'src', 'css');
    const files = walk(cssDir);
    const tokenFile = files.find((f) => GENERATED.test(f));
    const names = tokenFile ? generatedNames(tokenFile) : new Set();
    for (const file of files) {
      if (GENERATED.test(file)) continue;
      const rel = path.relative(root, file);
      const src = fs
        .readFileSync(file, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
        .replace(/url\([^)]*\)/g, (u) => u.replace(/[^\n]/g, ' '));
      src.split('\n').forEach((line, i) => {
        const hits = line.match(COLOR_RE);
        if (hits) issues.push(`${rel}:${i + 1}: hardcoded color ${hits[0]}… (use a generated token)`);
      });
      for (const block of topLevelRootBlocks(src)) {
        for (const m of block.matchAll(/(--[\w-]+)\s*:/g)) {
          // Spacing may be pinned to px (ferni-website's root font-size is 15px)
          if (names.has(m[1]) && !m[1].startsWith('--space-')) issues.push(`${rel}: redefines generated token ${m[1]} at :root`);
        }
      }
    }
  }
  return issues;
}
