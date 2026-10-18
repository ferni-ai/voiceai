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
  // warm & unhurried: where CSS and TS disagreed, the slower value won
  assert.equal(css.fast, '150ms');
  assert.equal(css.deliberate, '700ms');
  assert.equal(css.dramatic, '1000ms');
  // the four vars celebrations.ui.ts used without a definition
  assert.equal(css.entrance, '1000ms');
  assert.equal(css.celebration, '800ms');
  assert.equal(css.epic, '2000ms');
  assert.ok(animation.easings.expoOut);
});

/** Highest output value of a cubic-bezier(x1, y1, x2, y2) curve. */
function peak(curve) {
  const [, y1, , y2] = curve.match(/-?[\d.]+/g).map(Number);
  let max = 0;
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000;
    max = Math.max(max, 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3);
  }
  return max;
}

test('springGentle overshoots at most ~1.2 and less than spring', () => {
  const gentle = peak(animation.easings.springGentle);
  assert.ok(gentle > 1 && gentle <= 1.2, `springGentle peaks at ${gentle}`);
  assert.ok(gentle < peak(animation.easings.spring));
});
