// pnpm vitest run --config vitest.config.unit.ts design-system/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { cssDurations } from './duration-scale.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const animation = JSON.parse(fs.readFileSync(path.join(here, '../tokens/animation.json'), 'utf8'));

test('aliases resolve to the value of the step they name', () => {
  const scale = cssDurations({ durations: { fast: '100ms' }, durationAliases: { faster: 'fast' } });
  assert.deepEqual(scale, { fast: '100ms', faster: '100ms' });
});

test('an alias naming a missing step fails the build instead of emitting nothing', () => {
  assert.throws(() => cssDurations({ durations: {}, durationAliases: { faster: 'fast' } }), /not a step/);
});

test('animation.json: CSS and TS share one value per name', () => {
  const css = cssDurations(animation);
  for (const [name, value] of Object.entries(animation.durations)) assert.equal(css[name], value);
  // the names CSS used to define with a different value now carry the TS value
  assert.equal(css.fast, '100ms');
  assert.equal(css.deliberate, '500ms');
  assert.equal(css.dramatic, '600ms');
  // the four vars celebrations.ui.ts used without a definition
  assert.equal(css.entrance, '1000ms');
  assert.equal(css.celebration, '800ms');
  assert.equal(css.epic, '2000ms');
  assert.ok(animation.easings.expoOut);
});
