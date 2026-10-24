#!/usr/bin/env npx tsx
/**
 * Website theme debt ratchet: the numbers in section 2 of the website theme
 * plan (one generated token source, roles instead of palette steps), held so
 * they can only go down while the refactor lands.
 *
 * "Site" is apps/website/ferni-website/src: every CSS file under src/css plus
 * every .njk template (their <style> blocks, style="" attributes and SVG
 * attributes), skipping src/images and src/preview mock-ups. Comments are
 * stripped first. Token files (_tokens.css, tokens.css) are where colours
 * belong, so colour counts skip them.
 *
 * usage:
 *   npx tsx apps/cli/src/commands/quality/website-theme-debt.ts            check
 *   npx tsx apps/cli/src/commands/quality/website-theme-debt.ts --update   lower the baseline to today
 *   npx tsx apps/cli/src/commands/quality/website-theme-debt.ts --init     write a fresh baseline
 *
 * ratchet.ts runs the check too.
 *
 * @module quality/website-theme-debt
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'website-theme-debt-baseline.json');
const SITE = 'apps/website/ferni-website';
const SKIP_DIRS = new Set(['images', 'preview', 'node_modules']);
const TOKEN_FILES = new Set(['_tokens.css', 'tokens.css']);

export interface ThemeDebt {
  /** #hex, rgb()/rgba(), hsl()/hsla() in site CSS, token files excluded */
  colourLiteralsCss: number;
  /** the same in .njk templates */
  colourLiteralsTemplates: number;
  /** distinct opaque colours (normalised to #rrggbb) outside token files */
  distinctOpaque: number;
  /** distinct translucent colours (r,g,b,a) outside token files */
  distinctTranslucent: number;
  /** rules in a dark context: a dark selector or inside @media (prefers-color-scheme: dark) */
  darkContextRules: number;
  /** !important inside dark-context or body:not(.theme--dark) rules */
  importantInThemeRules: number;
  /** !important anywhere in site CSS */
  importantTotal: number;
  bodyNotDarkRules: number;
  rootRootRules: number;
  /** dead: nothing on the site sets data-theme="dark" */
  dataThemeDarkRules: number;
  /** colour custom properties declared outside the generated _tokens.css (tokens.css counts: it is a second source) */
  colourVarsOutsideTokens: number;
  /** CSS files under src/css that no template, stylesheet or script names */
  unreferencedCssFiles: number;
}

export interface Source {
  path: string;
  text: string;
}

export interface CssRule {
  selector: string;
  body: string;
  /** preludes of the enclosing at-rules, outermost first */
  atRules: string[];
}

export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\{#[\s\S]*?#\}/g, ' ');
}

/** Style rules of a stylesheet, with nested at-rules unwrapped. Comments must be stripped first. */
export function parseRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const walk = (text: string, atRules: string[]): void => {
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === ';' || ch === '}') start = i + 1;
      if (ch !== '{') continue;
      const prelude = text.slice(start, i).trim();
      let depth = 1;
      let j = i + 1;
      for (; j < text.length && depth > 0; j++)
        depth += text[j] === '{' ? 1 : text[j] === '}' ? -1 : 0;
      const body = text.slice(i + 1, j - 1);
      if (prelude.startsWith('@')) walk(body, [...atRules, prelude]);
      else rules.push({ selector: prelude, body, atRules });
      i = j - 1;
      start = j;
    }
  };
  walk(css, []);
  return rules;
}

/** Not an id, an entity (&#123;) or a link fragment (href="#add"). */
const HEX = /(?<![\w&#-]|href=["']?)#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const FUNC = /\b(rgba?|hsla?)\(\s*([^()]*)\)/gi;

/**
 * Colour literals in a piece of CSS or markup, normalised so equal colours compare
 * equal: opaque as "#rrggbb", translucent as "r,g,b,a" (alpha to 2 places), hsl() as "hsl:h,s,l,a".
 */
export function colourLiterals(text: string): string[] {
  const out: string[] = [];
  const rgb = (r: number, g: number, b: number, a: number): string =>
    a >= 1
      ? `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`
      : `${[r, g, b].map(Math.round).join(',')},${a.toFixed(2)}`;
  for (const m of text.matchAll(HEX)) {
    let hex = m[1]!.toLowerCase();
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    const [r, g, b, a = 255] = [0, 2, 4, 6].map((k) => parseInt(hex.slice(k, k + 2) || 'ff', 16));
    out.push(rgb(r!, g!, b!, a / 255));
  }
  for (const m of text.matchAll(FUNC)) {
    const parts = m[2]!.split(/[\s,/]+/).filter(Boolean);
    const alpha =
      parts[3] === undefined ? 1 : parseFloat(parts[3]) / (parts[3].endsWith('%') ? 100 : 1);
    const kind = m[1]!.toLowerCase().slice(0, 3);
    const channels = parts.slice(0, 3).map((p) => parseFloat(p) * (p.endsWith('%') ? 2.55 : 1));
    if (kind === 'rgb' && channels.length === 3 && channels.every(Number.isFinite)) {
      out.push(rgb(channels[0]!, channels[1]!, channels[2]!, alpha));
    } else out.push(`${kind}:${parts.slice(0, 3).join(',')},${alpha >= 1 ? 1 : alpha.toFixed(2)}`);
  }
  return out;
}

const isOpaque = (c: string): boolean => c.startsWith('#') || /,1$/.test(c);

export const DARK_SELECTOR = /\.theme--dark\b(?!\))|\[data-theme=["']?dark|\.dark-mode\b/;
export const DARK_MEDIA = /prefers-color-scheme\s*:\s*dark/;
const DATA_THEME_DARK = /\[data-theme=["']?dark["']?\]/;
/** A custom property declaration: name and value. */
const CUSTOM_PROP = /(?:^|[;{\s])--([\w-]+)\s*:([^;{}]*)/g;

/** Declarations of colour custom properties: "colo(u)r" or "page-" in the name, or a value that starts with a colour literal. */
export function colourVarDeclarations(css: string): number {
  return [...css.matchAll(CUSTOM_PROP)].filter(
    ([, name, value]) =>
      /colou?r|^page-/.test(name!) || /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\()/i.test(value!.trim())
  ).length;
}

/** The CSS of a template: its <style> blocks and style="" attribute values. */
export function templateCss(njk: string): { styleBlocks: string; inline: string } {
  const blocks = [...njk.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const inline = [...njk.matchAll(/\bstyle=(["'])([\s\S]*?)\1/gi)].map((m) => m[2]);
  return { styleBlocks: blocks.join('\n'), inline: inline.join(';\n') };
}

/**
 * CSS files no other file names. A file counts as named when its path under
 * src/css appears anywhere, or its bare name does and no other CSS file shares it.
 */
export function unreferencedCss(cssPaths: string[], corpus: Source[]): string[] {
  const names = cssPaths.map((p) => basename(p));
  return cssPaths.filter((path) => {
    const name = basename(path);
    const unique = names.filter((n) => n === name).length === 1;
    const needle = unique ? name : path;
    return !corpus.some((s) => s.path !== `src/css/${path}` && s.text.includes(needle));
  });
}

/** Adds a stylesheet's theme-fight rules to the debt. */
function countRules(css: string, debt: ThemeDebt): void {
  for (const rule of parseRules(css)) {
    const dark = DARK_SELECTOR.test(rule.selector) || rule.atRules.some((a) => DARK_MEDIA.test(a));
    const bodyNotDark = rule.selector.includes('body:not(.theme--dark)');
    if (dark) debt.darkContextRules++;
    if (bodyNotDark) debt.bodyNotDarkRules++;
    if (dark || bodyNotDark) {
      debt.importantInThemeRules += (rule.body.match(/!important/g) ?? []).length;
    }
    if (rule.selector.includes(':root:root')) debt.rootRootRules++;
    if (DATA_THEME_DARK.test(rule.selector)) debt.dataThemeDarkRules++;
  }
}

/** The debt in a set of stylesheets and templates. Paths are relative to the site root. */
export function measureSources(
  css: Source[],
  templates: Source[],
  corpus: Source[] = []
): ThemeDebt {
  const debt: ThemeDebt = {
    colourLiteralsCss: 0,
    colourLiteralsTemplates: 0,
    distinctOpaque: 0,
    distinctTranslucent: 0,
    darkContextRules: 0,
    importantInThemeRules: 0,
    importantTotal: 0,
    bodyNotDarkRules: 0,
    rootRootRules: 0,
    dataThemeDarkRules: 0,
    colourVarsOutsideTokens: 0,
    unreferencedCssFiles: 0,
  };
  const colours = new Set<string>();
  const sheets: Array<{ css: string; tokens: boolean; template: boolean; generated: boolean }> = [];
  for (const s of css) {
    const name = basename(s.path);
    sheets.push({
      css: stripComments(s.text),
      tokens: TOKEN_FILES.has(name),
      template: false,
      generated: name === '_tokens.css',
    });
  }
  for (const t of templates) {
    const { styleBlocks, inline } = templateCss(stripComments(t.text));
    sheets.push({ css: styleBlocks, tokens: false, template: true, generated: false });
    const found = colourLiterals(stripComments(t.text));
    debt.colourLiteralsTemplates += found.length;
    found.forEach((c) => colours.add(c));
    debt.importantTotal += (inline.match(/!important/g) ?? []).length;
  }
  for (const { css: text, tokens, template, generated } of sheets) {
    if (!generated) debt.colourVarsOutsideTokens += colourVarDeclarations(text);
    // A template's colours were counted from the whole file above.
    if (!tokens && !template) {
      const found = colourLiterals(text);
      debt.colourLiteralsCss += found.length;
      found.forEach((c) => colours.add(c));
    }
    debt.importantTotal += (text.match(/!important/g) ?? []).length;
    countRules(text, debt);
  }
  debt.distinctOpaque = [...colours].filter(isOpaque).length;
  debt.distinctTranslucent = colours.size - debt.distinctOpaque;
  const cssPaths = css.map((s) => s.path.replace(/^src\/css\//, ''));
  debt.unreferencedCssFiles = corpus.length > 0 ? unreferencedCss(cssPaths, corpus).length : 0;
  return debt;
}

function files(
  dir: string,
  root: string,
  test: (name: string) => boolean,
  skip = SKIP_DIRS,
  out: Source[] = []
): Source[] {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!skip.has(name) && !name.startsWith('.')) files(path, root, test, skip, out);
    } else if (test(name))
      out.push({ path: relative(root, path), text: readFileSync(path, 'utf8') });
  }
  return out;
}

export function measureWebsiteThemeDebt(repoRoot = process.cwd()): ThemeDebt {
  const site = join(repoRoot, SITE);
  const src = join(site, 'src');
  const css = files(join(src, 'css'), site, (n) => n.endsWith('.css'));
  const templates = files(src, site, (n) => n.endsWith('.njk'));
  const corpus = [
    // Preview pages are not measured, but they are deployed, so a stylesheet they load is in use.
    ...files(
      src,
      site,
      (n) => /\.(njk|css|js|mjs|json|html|md)$/.test(n),
      new Set(['node_modules'])
    ),
    { path: '.eleventy.js', text: readFileSync(join(site, '.eleventy.js'), 'utf8') },
  ];
  return measureSources(css, templates, corpus);
}

/** What rose above the baseline. Empty when the change may land. */
export function themeDebtRegressions(base: ThemeDebt, now: ThemeDebt): string[] {
  return (Object.keys(now) as Array<keyof ThemeDebt>)
    .filter((k) => now[k] > (base[k] ?? 0))
    .map(
      (k) =>
        `Website theme debt "${k}" rose ${base[k] ?? 0} → ${now[k]} (see website-theme-debt.ts).`
    );
}

/** The baseline lowered to wherever things now stand better; never raised. */
export function loweredThemeDebt(base: ThemeDebt, now: ThemeDebt): ThemeDebt {
  const out = { ...base };
  for (const k of Object.keys(base) as Array<keyof ThemeDebt>) out[k] = Math.min(base[k], now[k]);
  return out;
}

/** The ratchet's check: measures, prints one line, and returns the regressions. */
export function checkWebsiteThemeDebt(now = measureWebsiteThemeDebt()): string[] {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as ThemeDebt;
  const total = (d: ThemeDebt): number =>
    Object.values(d).reduce((a: number, b: number) => a + b, 0);
  process.stdout.write(`Website theme debt. Baseline: ${total(base)}  Now: ${total(now)}\n`);
  return themeDebtRegressions(base, now);
}

function main(): void {
  const args = process.argv.slice(2);
  const now = measureWebsiteThemeDebt();
  if (args.includes('--init') || args.includes('--update')) {
    const base = args.includes('--init')
      ? now
      : (JSON.parse(readFileSync(BASELINE, 'utf8')) as ThemeDebt);
    const next = loweredThemeDebt(base, now);
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 1)}\n`);
    process.stdout.write(`Website theme debt baseline: ${JSON.stringify(next)}\n`);
    return;
  }
  const worse = checkWebsiteThemeDebt(now);
  process.stdout.write(`${JSON.stringify(now, null, 1)}\n`);
  if (worse.length > 0) {
    process.stdout.write(`\n❌ ${worse.map((w) => `  - ${w}`).join('\n')}\n`);
    process.exit(1);
  }
  process.stdout.write('\n✅ No website theme debt metric rose.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
