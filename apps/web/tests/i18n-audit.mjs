#!/usr/bin/env node
/**
 * i18n usage audit for apps/web/src.
 *
 *   (a) t() calls that leave a placeholder of the en-US string unfilled
 *   (b) literal keys (t('a.b'), data-i18n="a.b") missing from en-US
 *   (c) en-US keys each other locale lacks (missing or [NEEDS_TRANSLATION])
 *   (d) key-shaped strings that reach the UI without going through t()
 *
 * (a), (b) and (d) are bugs and i18n-keys.test.ts fails on them. (c) is the
 * translation backlog, reported as numbers only.
 *
 * Usage (from apps/web): node tests/i18n-audit.mjs [--list]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = join(WEB, 'src');
const LOCALES = join(SRC, 'i18n', 'locales');
const KEY = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/;
const PLACEHOLDER = /\{(\w+)\}/g;

export function loadLocale(code) {
  return JSON.parse(readFileSync(join(LOCALES, `${code}.json`), 'utf8'));
}

export function valueOf(tree, key) {
  let node = tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function leafKeys(tree, prefix = '') {
  return Object.entries(tree).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v) ? leafKeys(v, path) : [path];
  });
}

export function sourceFiles(dir = SRC) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|spec|d)\.ts$/.test(name) ? [path] : [];
  });
}

/** Reads a quoted literal at `i`; returns [text, endIndex] or null. */
function readString(src, i) {
  const q = src[i];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let out = '';
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { out += src[j + 1]; j++; continue; }
    if (q === '`' && src[j] === '$' && src[j + 1] === '{') return [null, j]; // dynamic
    if (src[j] === q) return [out, j + 1];
    out += src[j];
  }
  return null;
}

/** Splits the argument list starting after `(` into top-level args; returns [args, end]. */
function readArgs(src, i) {
  const args = [];
  let depth = 0;
  let start = i;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "'" || c === '"' || c === '`') {
      const s = readString(src, j);
      if (!s) return [args, j];
      // Template literals with ${} — skip to the closing backtick naively.
      j = s[0] === null ? src.indexOf('`', s[1]) : s[1] - 1;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      if (depth === 0) {
        args.push(src.slice(start, j).trim());
        return [args.filter(Boolean), j + 1];
      }
      depth--;
    } else if (c === ',' && depth === 0) {
      args.push(src.slice(start, j).trim());
      start = j + 1;
    }
  }
  return [args, src.length];
}

/** Top-level property names of an object literal, or null when a spread hides them. */
export function objectKeys(literal) {
  const [parts] = readArgs(`${literal.slice(1, -1)})`, 0);
  const names = new Set();
  for (const part of parts) {
    if (part.startsWith('...')) return null;
    const name = /^['"]?([\w$]+)['"]?\s*(?::|$)/.exec(part)?.[1];
    if (name) names.add(name);
  }
  return names;
}

/** Every t('literal', ...) call in a file. */
export function tCalls(source) {
  const calls = [];
  for (const m of source.matchAll(/(?<![\w$])t\(\s*/g)) {
    const at = m.index + m[0].length;
    const lit = readString(source, at);
    if (!lit) continue;
    const line = source.slice(0, m.index).split('\n').length;
    if (lit[0] === null) { calls.push({ line, key: null }); continue; }
    const [rest, end] = readArgs(source, lit[1]);
    let params; // undefined = none passed, null = can't tell, Set = names
    let fallback;
    for (const arg of rest) {
      const str = readString(arg, 0);
      if (str && str[0] !== null && str[1] === arg.length) fallback = str[0];
      else if (arg.startsWith('{')) params = objectKeys(arg);
      else params = null; // variable / call: names unknown
    }
    const replacedAfter = /^\s*\)?\s*\.replace(All)?\(/.test(source.slice(end));
    calls.push({ line, key: lit[0], params, fallback, replacedAfter });
  }
  return calls;
}

export function audit() {
  const en = loadLocale('en-US');
  const unfilled = [];
  const missing = [];
  const dynamic = [];
  const rawKeys = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(SRC, file);
    for (const call of tCalls(source)) {
      if (call.key === null) { dynamic.push(`${rel}:${call.line}`); continue; }
      if (!KEY.test(call.key)) continue;
      const value = valueOf(en, call.key);
      if (value === undefined) missing.push(`${rel}:${call.line} ${call.key}`);
      const template = value ?? call.fallback ?? '';
      const wanted = [...template.matchAll(PLACEHOLDER)].map((p) => p[1]);
      if (!wanted.length || call.params === null) continue;
      const passed = call.params ?? new Set();
      const gaps = wanted.filter((name) => !passed.has(name));
      if (gaps.length) {
        const how = call.params === undefined && call.replacedAfter ? ' (manual .replace)' : '';
        unfilled.push(`${rel}:${call.line} ${call.key} {${gaps.join(',')}}${how}`);
      }
    }
    for (const m of source.matchAll(/data-i18n(?:-[a-z-]+)?="([^"$]+)"/g)) {
      if (KEY.test(m[1]) && valueOf(en, m[1]) === undefined) {
        missing.push(`${rel}:${source.slice(0, m.index).split('\n').length} ${m[1]} (data-i18n)`);
      }
    }
    // (d) a literal inside an existing en-US namespace (a.b.<missing>): fed
    // to t() later, it renders as the raw key. Two-segment ids such as
    // 'celebration.small' (sound names) share namespaces, so only depth 3+.
    for (const m of source.matchAll(/['"]([a-zA-Z][\w]*(?:\.[\w]+){2,})['"]/g)) {
      const parts = m[1].split('.');
      const walk = (path) => path.reduce((n, part) => (n && typeof n === 'object' ? n[part] : undefined), en);
      // A full path that is an object is a plural family (key.one / key.other).
      if (typeof walk(parts.slice(0, -1)) === 'object' && walk(parts) === undefined) {
        rawKeys.push(`${rel}:${source.slice(0, m.index).split('\n').length} ${m[1]}`);
      }
    }
  }
  const enKeys = leafKeys(en).filter((k) => typeof valueOf(en, k) === 'string');
  const backlog = {};
  const copiedEnglish = {};
  for (const code of ['fr', 'ja', 'en-GB', 'zh-Hans', 'ko', 'zh-Hant', 'es', 'de', 'he', 'ar']) {
    const tree = loadLocale(code);
    const values = enKeys.map((k) => [valueOf(en, k), valueOf(tree, k)]);
    backlog[code] = values.filter(([, v]) => v === undefined || v.startsWith('[NEEDS_TRANSLATION]')).length;
    copiedEnglish[code] = values.filter(([e, v]) => v === e && /[a-zA-Z]{3}/.test(e)).length;
  }
  return { unfilled, missing, dynamic, rawKeys, backlog, copiedEnglish, enKeyCount: enKeys.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = audit();
  const list = process.argv.includes('--list');
  const show = (label, items) => {
    console.log(`${label}: ${items.length}`);
    if (list) items.forEach((i) => console.log(`  ${i}`));
  };
  show('(a) unfilled placeholders', r.unfilled);
  show('(b) keys missing from en-US', r.missing);
  console.log(`(c) per locale, of ${r.enKeyCount} en-US keys: missing or [NEEDS_TRANSLATION] / same text as en-US`);
  for (const [code, n] of Object.entries(r.backlog)) {
    console.log(`  ${code.padEnd(8)} ${String(n).padStart(5)} / ${r.copiedEnglish[code]}`);
  }
  show('(d) key-shaped literals with no en-US entry (render raw if translated)', r.rawKeys);
  show('    t() calls with a dynamic key (unchecked)', r.dynamic);
  process.exitCode = r.unfilled.length || r.missing.length ? 1 : 0;
}
