import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import {
  colourLiterals,
  loweredThemeDebt,
  measureSources,
  parseRules,
  stripComments,
  themeDebtRegressions,
  unreferencedCss,
  type ThemeDebt,
} from '../website-theme-debt.js';

const SHEET = `
/* #123456 in a comment does not count */
.card { color: #fff; background: rgba(74, 103, 65, 0.5); }
:root:root .hero { color: #2c2520 !important; }
body:not(.theme--dark) .band { background: #2c2520 !important; border-color: rgb(255 255 255); }
[data-theme="dark"] .card { color: #faf8f5; }
@media (prefers-color-scheme: dark) {
  .card { color: hsl(30, 20%, 90%) !important; }
}
`;

const PAGE = `{# #999999 in a template comment #}
<a href="#faq">FAQ</a>
<div style="color: #ABCDEF !important">x</div>
<style>.theme--dark .page { background: #000; }</style>`;

function debt(css = SHEET, page = PAGE): ThemeDebt {
  return measureSources(
    [{ path: 'src/css/site.css', text: css }],
    [{ path: 'src/page.njk', text: page }]
  );
}

describe('website theme debt', () => {
  it('counts each section 2 metric in a stylesheet and a template', () => {
    const d = debt();
    expect(d.colourLiteralsCss).toBe(7);
    expect(d.colourLiteralsTemplates).toBe(2);
    expect(d.bodyNotDarkRules).toBe(1);
    expect(d.rootRootRules).toBe(1);
    expect(d.dataThemeDarkRules).toBe(1);
    expect(d.darkContextRules).toBe(3);
    expect(d.importantInThemeRules).toBe(2);
    expect(d.importantTotal).toBe(4);
  });

  it('treats equal colours as one, whatever the notation', () => {
    expect(colourLiterals('#fff rgb(255, 255, 255) #FFFFFF')).toEqual([
      '#ffffff',
      '#ffffff',
      '#ffffff',
    ]);
    expect(colourLiterals('#4a674180 rgba(74 103 65 / 50%)')).toEqual([
      '74,103,65,0.50',
      '74,103,65,0.50',
    ]);
    const d = debt('.a { color: #fff; } .b { color: white; background: rgb(255,255,255); }', '');
    expect(d.distinctOpaque).toBe(1);
  });

  it('does not read ids, links or entities as colours', () => {
    expect(colourLiterals('#feed-list { } <a href="#add">&#123;</a> #abcdefg')).toEqual([]);
  });

  it('skips token files for colour counts but not for rule counts', () => {
    const d = measureSources(
      [{ path: 'src/css/_tokens.css', text: ':root:root { --x: #fff; }' }],
      []
    );
    expect(d.colourLiteralsCss).toBe(0);
    expect(d.rootRootRules).toBe(1);
  });

  it('finds rules nested in at-rules and keeps their at-rule', () => {
    const rules = parseRules(
      stripComments('@media (min-width: 1px) { @supports (x: y) { .a { b: c } } } .d { e: f }')
    );
    expect(rules.map((r) => r.selector)).toEqual(['.a', '.d']);
    expect(rules[0]!.atRules).toEqual(['@media (min-width: 1px)', '@supports (x: y)']);
  });

  it('lists only stylesheets that no other file names', () => {
    const corpus = [
      { path: 'src/page.njk', text: '<link href="/css/used.css">' },
      { path: 'src/css/orphan.css', text: '/* orphan.css */' },
    ];
    expect(unreferencedCss(['used.css', 'orphan.css'], corpus)).toEqual(['orphan.css']);
  });

  it('fails when any metric rises', () => {
    const base = debt();
    const worse = debt(`${SHEET}\nbody:not(.theme--dark) .x { color: #111 !important; }`);
    const problems = themeDebtRegressions(base, worse);
    expect(problems.some((p) => p.includes('"bodyNotDarkRules" rose 1 → 2'))).toBe(true);
    expect(problems.some((p) => p.includes('"colourLiteralsCss" rose 7 → 8'))).toBe(true);
  });

  it('passes when every metric is equal or lower, and --update never raises the baseline', () => {
    const base = debt();
    const better = debt(SHEET.replace(/:root:root /, ''));
    expect(themeDebtRegressions(base, base)).toEqual([]);
    expect(themeDebtRegressions(base, better)).toEqual([]);
    expect(loweredThemeDebt(base, better).rootRootRules).toBe(0);
    expect(loweredThemeDebt(better, base).rootRootRules).toBe(0);
  });

  it('has a committed baseline that names every metric', () => {
    const baseline = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../website-theme-debt-baseline.json', import.meta.url)),
        'utf8'
      )
    ) as ThemeDebt;
    expect(Object.keys(baseline).sort()).toEqual(Object.keys(debt()).sort());
  });
});
