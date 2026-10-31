// pnpm vitest run --config vitest.config.unit.ts design-system/lib/tailwind-roles.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { roleUtilities } from './tailwind-roles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const semantic = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'design-system/tokens/semantic-colors.json'), 'utf8')
);
const SITE = path.join(ROOT, 'apps/website/ferni-website');
const tokensCss = fs.readFileSync(path.join(SITE, 'src/css/_tokens.css'), 'utf8');

test('role utilities point at the role variables, never at literals', () => {
  assert.deepEqual(roleUtilities(semantic), {
    backgroundColor: {
      'surface-base': 'var(--color-surface-base)',
      'surface-sunken': 'var(--color-surface-sunken)',
      'surface-raised': 'var(--color-surface-raised)',
      'surface-overlay': 'var(--color-surface-overlay)',
    },
    textColor: {
      primary: 'var(--color-text-primary)',
      secondary: 'var(--color-text-secondary)',
      muted: 'var(--color-text-muted)',
    },
    borderColor: {
      subtle: 'var(--color-border-subtle)',
      strong: 'var(--color-border-strong)',
    },
  });
});

test('every variable a role utility reads is declared in _tokens.css', () => {
  for (const values of Object.values(roleUtilities(semantic))) {
    for (const value of Object.values(values)) {
      const name = value.slice('var('.length, -1);
      assert.match(tokensCss, new RegExp(`${name}\\s*:`), `${name} is not declared in _tokens.css`);
    }
  }
});

test('a utility for a role semantic-colors.json lacks is an error', () => {
  const withoutSurfaces = {
    groups: semantic.groups.filter((group) => !('surface-raised' in group.roles)),
  };
  assert.throws(() => roleUtilities(withoutSurfaces), /no --color-surface-base role/);
});

test('the website tailwind config takes its colours from the generated file', () => {
  const require = createRequire(import.meta.url);
  const generated = require(path.join(SITE, 'tailwind.config.generated.js'));
  const { extend } = require(path.join(SITE, 'tailwind.config.js')).theme;
  const roles = roleUtilities(semantic);
  assert.deepEqual(generated.backgroundColor, roles.backgroundColor);
  assert.deepEqual(extend.backgroundColor, roles.backgroundColor);
  assert.deepEqual(extend.textColor, roles.textColor);
  assert.deepEqual(extend.borderColor, roles.borderColor);
  for (const [key, value] of Object.entries(generated.colors)) {
    assert.deepEqual(extend.colors[key], value, `colors.${key} differs from the generated file`);
  }
});
