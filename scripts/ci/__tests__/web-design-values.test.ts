/**
 * #3274: apps/web/src may not gain hard-coded design values. The real tree must stay within
 * the baseline (this file runs in the "Run the scripts/ci ratchets" step on every pull
 * request), each kind must be counted, and one planted literal of any kind must fail.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  countValues,
  KIND_NAMES,
  lowered,
  measure,
  readBaseline,
  regressions,
  SCAN_ROOT,
  totals,
} from '../web-design-values.js';

let root: string | undefined;

function tree(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'web-design-values-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('countValues', () => {
  it.each([
    ['colour', "const c = '#ff8800';"],
    ['colour', 'const c = `color: #abc;`;'],
    ['colour', "el.style.background = 'rgba(0, 0, 0, 0.4)';"],
    ['colour', 'const c = `hsl(120 50% 50%)`;'],
    ['shadow', 'const s = `box-shadow: 0 2px 8px var(--shade);`;'],
    ['shadow', "el.style.boxShadow = ''; const o = { boxShadow: '0 1px 2px black' };"],
    ['shadow', 'const f = `filter: drop-shadow(0 4px 6px var(--x));`;'],
    ['easing', 'const e = `transition: opacity var(--d) cubic-bezier(0.2, 0, 0, 1);`;'],
    ['duration', 'const t = `transition: opacity 200ms var(--ease);`;'],
    ['duration', "const o = { animationDuration: '1.5s' };"],
    ['fontSize', 'const f = `font-size: 14px;`;'],
    ['fontSize', "const o = { fontSize: '1.25rem' };"],
    ['important', 'const i = `display: none !important;`;'],
  ] as const)('counts a %s in %s', (kind, code) => {
    expect(countValues(code)[kind]).toBe(1);
  });

  it.each([
    "const c = 'var(--color-ink)';",
    'const s = `box-shadow: var(--shadow-soft);`;',
    'const s = `box-shadow: none;`;',
    'const t = `transition: opacity var(--duration-fast) var(--ease-out);`;',
    'const f = `font-size: var(--text-sm);`;',
    "const o = { fontSize: 'inherit' };",
    '// see #3274 and #1234 for why, and #fff in a comment',
    '/* box-shadow: 0 0 1px red !important; font-size: 12px; */',
    "const url = 'https://example.com/#abc';",
    "const id = 'issue-#123';",
    'setTimeout(done, 300);',
  ])('counts nothing in %s', (code) => {
    expect(countValues(code)).toEqual({});
  });

  it('strips /* */ comments in CSS without reading // as a comment', () => {
    const css = '/* #fff */ a { background: url(//cdn.example.com/x.png); color: #123456; }';
    expect(countValues(css, true)).toEqual({ colour: 1 });
  });
});

describe('the web design-value ratchet', () => {
  const file = `${SCAN_ROOT}/ui/card.ts`;
  const clean = 'export const card = `color: var(--ink); font-size: var(--text-sm);`;\n';

  it.each(KIND_NAMES)('fails one planted %s in a file the baseline has', (kind) => {
    const planted: Record<(typeof KIND_NAMES)[number], string> = {
      colour: 'color: #0a0b0c;',
      shadow: 'box-shadow: 0 1px 2px var(--x);',
      easing: 'transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);',
      duration: 'transition: color 150ms var(--ease);',
      fontSize: 'font-size: 13px;',
      important: 'color: var(--ink) !important;',
    };
    const beforeRoot = tree({ [file]: `${clean}export const old = \`font-size: 12px;\`;\n` });
    const before = measure(beforeRoot);
    rmSync(beforeRoot, { recursive: true, force: true });
    const now = measure(
      tree({
        [file]: `${clean}export const old = \`font-size: 12px;\`;\nexport const x = \`${planted[kind]}\`;\n`,
      })
    );
    const worse = regressions(before, now);
    expect(worse).toHaveLength(1);
    expect(worse[0]).toContain(`${file}: ${kind}`);
  });

  it('fails a literal in a file the baseline does not have, and skips tests', () => {
    const now = measure(
      tree({
        [`${SCAN_ROOT}/new.css`]: '.a { color: #fff; }',
        [`${SCAN_ROOT}/__tests__/a.test.ts`]: "const c = '#fff';",
        [`${SCAN_ROOT}/b.test.ts`]: "const c = '#fff';",
      })
    );
    expect(regressions({}, now)).toEqual([`${SCAN_ROOT}/new.css: colour 0 → 1`]);
  });

  it('only lowers the baseline: never raises a count or gains a file', () => {
    const baseline = { 'a.ts': { colour: 3, important: 1 }, 'b.ts': { shadow: 2 } };
    const now = { 'a.ts': { colour: 5 }, 'b.ts': { shadow: 1 }, 'c.ts': { easing: 4 } };
    expect(lowered(baseline, now)).toEqual({ 'a.ts': { colour: 3 }, 'b.ts': { shadow: 1 } });
  });

  it('apps/web/src has no more hard-coded design values than the baseline', () => {
    const baseline = readBaseline();
    expect(Object.keys(baseline).length).toBeGreaterThan(0);
    expect(regressions(baseline, measure())).toEqual([]);
  });

  it('the baseline is the size the 2026-10-31 audit found, so it is not empty or stale', () => {
    // Every kind is present: a matcher that broke and counts 0 would leave its kind unguarded
    const sum = totals(readBaseline());
    for (const kind of KIND_NAMES) expect(sum[kind]).toBeGreaterThan(0);
  });
});
