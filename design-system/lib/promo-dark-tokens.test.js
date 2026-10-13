// node --test design-system/lib/
// Dark-mode guards for the ferni.ai promo site (apps/website/ferni-website).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE_CSS = path.join(ROOT, 'apps/website/ferni-website/src/css');
const tokens = fs.readFileSync(path.join(SITE_CSS, '_tokens.css'), 'utf8');

/** Custom-property names declared directly inside the block that starts at `opener`. */
function declaredIn(css, opener) {
  const start = css.indexOf(opener);
  assert.notEqual(start, -1, `${opener} block missing from _tokens.css`);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) { end = i; break; }
  }
  return new Set([...css.slice(start, end).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

// A page painted with one of these aliases stays cream in dark mode unless the
// dark block overrides it too (story-v2 painted its body with --color-bg: 1.08:1).
const SURFACE = /^--color-(bg|background|elevated)(-|$)/;
const FIXED_SURFACES = new Set(['--color-bg-hover', '--color-bg-code', '--color-bg-sage-subtle', '--color-background-hover', '--color-background-deep']);
const lightSurfaces = [...declaredIn(tokens, ':root {')]
  .filter((name) => SURFACE.test(name) && !FIXED_SURFACES.has(name) && !name.startsWith('--color-bg-dark'));

test('the light theme has surface aliases to check', () => {
  assert.ok(lightSurfaces.includes('--color-bg'), lightSurfaces.join(' '));
});

for (const opener of ['@media (prefers-color-scheme: dark)', '[data-theme="dark"] {']) {
  test(`${opener} overrides every light surface alias`, () => {
    const dark = declaredIn(tokens, opener);
    assert.deepEqual(lightSurfaces.filter((name) => !dark.has(name)), []);
  });
}

test('no promo-site stylesheet defines a custom property as itself', () => {
  // `--x: var(--x)` is a cycle: the property computes to nothing and every
  // surface painted with it goes transparent (the story-v2 phone mockup).
  const cycles = [];
  for (const file of fs.readdirSync(SITE_CSS).filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(SITE_CSS, file), 'utf8');
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*[,)]/g)) {
      if (m[1] === m[2]) cycles.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(cycles, []);
});
