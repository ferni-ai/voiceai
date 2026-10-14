// node --test design-system/generate-sequences.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { generate } from './generate-sequences.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

test('emits every sequence and skips documentation keys', () => {
  const out = generate({
    sequences: {
      _documentation: { note: 'x' },
      a: { id: 'a', steps: [] },
      b: { id: 'b', steps: [] },
    },
    reducedMotion: {
      simplifications: { a: { removeSteps: ['avatar'] }, gone: { removeSteps: [] } },
    },
  });
  assert.ok(out.includes("  | 'a'\n  | 'b';"));
  assert.ok(!out.includes('_documentation'));
  assert.ok(out.includes('"removeSteps"'));
  assert.ok(!out.includes('"gone"'));
});

test('the generated file is in sync with the tokens', () => {
  const tokens = JSON.parse(fs.readFileSync(path.join(dir, 'tokens/sequences.json'), 'utf8'));
  const generated = fs.readFileSync(
    path.join(dir, '../apps/web/src/config/sequences.generated.ts'),
    'utf8'
  );
  assert.equal(generated, generate(tokens));
});
