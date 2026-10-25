// pnpm vitest run --config vitest.config.unit.ts design-system/
// Dark-mode guards for the ferni.ai promo site (apps/website/ferni-website).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { inverseThemeLines, resolveRef, themeRoleGroups } from './website-theme.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE_CSS = path.join(ROOT, 'apps/website/ferni-website/src/css');
const tokens = fs.readFileSync(path.join(SITE_CSS, '_tokens.css'), 'utf8');

/** Custom properties (name -> value) declared directly inside the block that starts at `opener`. */
function declarationsIn(css, opener) {
  const start = css.indexOf(opener);
  assert.notEqual(start, -1, `${opener} block missing from _tokens.css`);
  let depth = 0;
  let end = start;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) { end = i; break; }
  }
  return new Map([...css.slice(start, end).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]*);/g)].map((m) => [m[1], m[2]]));
}

function declaredIn(css, opener) {
  return new Set(declarationsIn(css, opener).keys());
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

for (const opener of ['@media (prefers-color-scheme: dark)', ':root[data-theme="dark"] {']) {
  test(`${opener} overrides every light surface alias`, () => {
    const dark = declaredIn(tokens, opener);
    assert.deepEqual(lightSurfaces.filter((name) => !dark.has(name)), []);
  });
}

const DS = path.join(ROOT, 'design-system/tokens');
const loadJson = (file) => JSON.parse(fs.readFileSync(path.join(DS, file), 'utf8'));
const colors = loadJson('colors.json');
const spacing = loadJson('spacing.json');
const roles = themeRoleGroups(loadJson('semantic-colors.json'), colors, spacing).flatMap((group) => group.roles);
const BLOCKS = [
  [':root {', 'light'],
  ['@media (prefers-color-scheme: dark)', 'dark'],
  [':root[data-theme="dark"] {', 'dark'],
];

test('semantic-colors.json has the dark roles _tokens.css overrides', () => {
  assert.ok(roles.some((role) => role.name === '--color-bg'), roles.map((role) => role.name).join(' '));
  assert.ok(roles.some((role) => role.name === '--color-ferni-text' && role.dark), 'persona text role');
});

for (const [opener, theme] of BLOCKS) {
  test(`${opener} declares every semantic role with its ${theme} value`, () => {
    const declared = declarationsIn(tokens, opener);
    const wrong = roles
      .filter((role) => role[theme] !== undefined && declared.get(role.name) !== role[theme])
      .map((role) => `${role.name}: ${declared.get(role.name)} (want ${role[theme]})`);
    assert.deepEqual(wrong, []);
  });
}

// Theme plan section 4: the role names and today's values, light then dark.
const SECTION_4_ROLES = {
  '--color-surface-base': ['#faf8f5', '#14110e'],
  '--color-surface-sunken': ['#f5f2ed', '#1e1a16'],
  '--color-surface-raised': ['#ffffff', '#2a241f'],
  '--color-surface-overlay': ['#fffdfb', '#352e28'],
  '--color-text-primary': ['#2c2520', '#f4efe6'],
  '--color-text-secondary': ['#5c544a', '#cfc3b4'],
  '--color-text-muted': ['#6b635a', '#a89b8c'],
  '--color-accent': ['#3D5A45', '#8eae7a'],
  '--color-accent-hover': ['#4a6b52', '#a4c48f'],
  '--color-accent-pressed': ['#2d4535', '#6f8f5c'],
  '--color-on-accent': ['#faf8f5', '#14110e'],
  '--color-brand-text': ['#4a6741', '#a5c99a'],
  '--color-border-subtle': ['rgba(44, 37, 32, 0.05)', 'rgba(244, 239, 230, 0.10)'],
  '--color-border-strong': ['rgba(44, 37, 32, 0.18)', 'rgba(244, 239, 230, 0.24)'],
  '--shadow-raised': [spacing.shadows.zen.md, spacing.shadows.midnight.md],
  '--shadow-overlay': [spacing.shadows.zen.xl, spacing.shadows.midnight.xl],
};

test('the section 4 theme roles keep today\'s light and dark values', () => {
  const byName = new Map(roles.map((role) => [role.name, role]));
  const wrong = Object.entries(SECTION_4_ROLES)
    .filter(([name, [light, dark]]) => byName.get(name)?.light !== light || byName.get(name)?.dark !== dark)
    .map(([name]) => `${name}: ${JSON.stringify(byName.get(name))}`);
  assert.deepEqual(wrong, []);
});

test('[data-surface="inverse"] declares every section 4 role with its inverse value', () => {
  const declared = declarationsIn(tokens, '[data-surface="inverse"] {');
  const byName = new Map(roles.map((role) => [role.name, role]));
  const wrong = Object.keys(SECTION_4_ROLES)
    .filter((name) => !byName.get(name)?.inverse || declared.get(name) !== byName.get(name).inverse.light)
    .map((name) => `${name}: ${declared.get(name)}`);
  assert.deepEqual(wrong, []);
  assert.equal(declared.get('--color-surface-base'), '#2c2520');
  assert.equal(declared.get('--color-text-primary'), '#faf8f5');
});

test('inverse dark blocks appear only for roles whose inverse value changes in dark mode', () => {
  const role = (dark) => ({ name: '--color-surface-base', inverse: { light: '#2c2520', dark } });
  const same = inverseThemeLines([{ label: 'Surfaces', roles: [role('#2c2520')] }]).join('\n');
  assert.doesNotMatch(same, /prefers-color-scheme|data-theme/);
  const tuned = inverseThemeLines([{ label: 'Surfaces', roles: [role('#0a0908')] }]).join('\n');
  assert.match(tuned, /:root:not\(\[data-theme="light"\]\) \[data-surface="inverse"\] \{\n {4}\/\* Surfaces \*\/\n {4}--color-surface-base: #0a0908;/);
  assert.match(tuned, /:root\[data-theme="dark"\] \[data-surface="inverse"\] \{\n {2}\/\* Surfaces \*\/\n {2}--color-surface-base: #0a0908;/);
});

test('the manual dark theme applies only to <html data-theme="dark">', () => {
  assert.doesNotMatch(tokens, /^\[data-theme="dark"\]/m);
  assert.match(tokens, /^:root\[data-theme="dark"\] \{/m);
});

test('a semantic role that points at a missing colour fails the build', () => {
  assert.throws(() => resolveRef(spacing, 'shadows.midnight.nope', 'spacing.json'), /not a colour in spacing\.json/);
  assert.throws(() => resolveRef(colors, 'themes.midnight.background.nope'), /not a colour/);
  assert.equal(resolveRef(colors, '#14110e'), '#14110e');
});

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

test('the hand-written tokens.css declares no colours (they come from _tokens.css)', () => {
  // tokens.css loads before story-brand.css, which imports _tokens.css, so a
  // colour declared in tokens.css is either dead or a second source of truth.
  const handWritten = declarationsIn(fs.readFileSync(path.join(SITE_CSS, 'tokens.css'), 'utf8'), ':root {');
  const COLOUR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|color-mix)\(|var\(--color-/i;
  const colours = [...handWritten]
    .filter(([name, value]) => name.startsWith('--color-') || COLOUR.test(value))
    .map(([name, value]) => `${name}: ${value}`);
  assert.deepEqual(colours, []);
  assert.ok(handWritten.has('--space-4'), 'tokens.css still declares spacing');
});
