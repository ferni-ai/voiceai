/**
 * Template safety contract.
 *
 * Pages rendered from these templates are served on the app's own origin
 * (no sandbox), so no request or model input may reach the page as markup or
 * script. Every expression is checked by where it lands:
 * - no triple-stash (raw HTML) except the one server-built CSS block;
 * - inside <script>: only the `json` helper (script-safe JSON);
 * - in href/src/url(): only `safeUrl`;
 * - inside <style>: only `cssToken`/`safeUrl`, or values the generator
 *   validates (hex colours, colours derived from them, slug ids);
 * - helpers: only the encoding helpers below.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { cssToken, safeUrl, scriptJson } from '../template-encoders.js';

interface Node {
  type: string;
  [key: string]: unknown;
}
interface Mustache extends Node {
  escaped: boolean;
  path: { original: string };
  params: unknown[];
  loc: { start: { line: number } };
}

const TEMPLATES = ['base.hbs', 'financial-legends.hbs'];
const ENCODING_HELPERS = new Set(['json', 'safeUrl', 'cssToken']);
/** Built by generatePersonaCss from a validated slug id and validated hex colours. */
const TRUSTED_RAW = new Set(['personaCss']);
/** Values the generator validates (hex) or derives from validated values. */
const VALIDATED_CSS_VALUES = new Set([
  'brand.primary',
  'brand.secondary',
  'brand.glow',
  'brand.tint',
  'brand.gradientOrb',
  'color',
  'id',
]);

function inside(html: string, tag: string): boolean {
  return html.lastIndexOf(`<${tag}`) > html.lastIndexOf(`</${tag}>`);
}

/** Walk the template in source order, judging each expression by the markup before it. */
function violations(file: string): string[] {
  const source = readFileSync(join(__dirname, '..', 'templates', file), 'utf8');
  const found: string[] = [];
  let html = '';

  const visit = (node: Node | null | undefined): void => {
    if (!node) return;
    if (node.type === 'Program') (node.body as Node[]).forEach(visit);
    else if (node.type === 'ContentStatement') html += node.original as string;
    else if (node.type === 'BlockStatement') {
      visit(node.program as Node);
      visit(node.inverse as Node);
    } else if (node.type === 'MustacheStatement') {
      const m = node as Mustache;
      const name = m.path.original;
      const helper = m.params.length > 0 ? name : null;
      const where = `${file}:${m.loc.start.line} {{${name}}}`;
      if (!m.escaped && !TRUSTED_RAW.has(name)) found.push(`${where}: raw (triple-stash) output`);
      if (helper && !ENCODING_HELPERS.has(helper)) found.push(`${where}: unvetted helper`);
      if (inside(html, 'script') && helper !== 'json')
        found.push(`${where}: script needs {{json}}`);
      if (/(href|src)="$|url\('$/.test(html) && helper !== 'safeUrl') {
        found.push(`${where}: URL needs {{safeUrl}}`);
      }
      const cssOk = helper ? ENCODING_HELPERS.has(helper) : VALIDATED_CSS_VALUES.has(name);
      if (inside(html, 'style') && !cssOk && !TRUSTED_RAW.has(name)) {
        found.push(`${where}: unvalidated value in <style>`);
      }
    }
  };

  visit(Handlebars.parse(source) as unknown as Node);
  return found;
}

describe('page templates cannot emit input as markup or script', () => {
  it.each(TEMPLATES)('%s: every expression is encoded for where it lands', (file) => {
    expect(violations(file)).toEqual([]);
  });
});

describe('encoding helpers', () => {
  it('scriptJson cannot close a <script> or break a JS string', () => {
    const hostile = '</script><script>x()</script>\u2028\u2029&\\\'"';
    const out = scriptJson(hostile);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(out)).toBe(hostile);
  });

  it('safeUrl keeps web, mail, same-site and image-data URLs only', () => {
    for (const ok of ['https://a.example/x.png', 'http://a.example', 'mailto:a@b.c', '/terms']) {
      expect(safeUrl(ok)).toBe(ok);
    }
    expect(safeUrl('data:image/svg+xml,%3Csvg%3E')).toBe('data:image/svg+xml,%3Csvg%3E');
    for (const bad of [
      'javascript:x()',
      ' JaVaScRiPt:x()',
      'data:text/html,x',
      '//evil',
      'vbscript:x',
    ]) {
      expect(safeUrl(bad)).toBe('#');
    }
    expect(safeUrl('https://a.example/\n}body{')).toBe('#');
  });

  it('cssToken leaves nothing that can end a declaration, rule, string or element', () => {
    expect(cssToken("Mark Pro';}</style><script>")).not.toMatch(/[;:{}<>'"\\/()]/);
    expect(cssToken('Mark Pro')).toBe('Mark Pro');
    expect(cssToken(700)).toBe('700');
  });
});
