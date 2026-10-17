// pnpm vitest run --config vitest.config.unit.ts design-system/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import sharp from 'sharp';
import { writePngIfChanged } from './write-png-if-changed.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpic-'));
const svg = path.join(dir, 'icon.svg');
const png = path.join(dir, 'icon-32.png');
const square = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${fill}"/><circle cx="32" cy="32" r="20" fill="#fff"/></svg>`;

test('writes a missing PNG', async () => {
  fs.writeFileSync(svg, square('#4a6741'));
  assert.equal(await writePngIfChanged(sharp, svg, png, 32), true);
  assert.equal((await sharp(png).metadata()).width, 32);
});

test('leaves a PNG alone when only its encoding differs', async () => {
  // Same pixels, different bytes: what another libvips/zlib build produces.
  const reencoded = await sharp(png).png({ compressionLevel: 0 }).toBuffer();
  assert.notDeepEqual(reencoded, fs.readFileSync(png));
  fs.writeFileSync(png, reencoded);
  assert.equal(await writePngIfChanged(sharp, svg, png, 32), false);
  assert.deepEqual(fs.readFileSync(png), reencoded);
});

test('rewrites the PNG when the pixels changed', async () => {
  fs.writeFileSync(svg, square('#c4523b'));
  const before = fs.readFileSync(png);
  assert.equal(await writePngIfChanged(sharp, svg, png, 32), true);
  assert.notDeepEqual(fs.readFileSync(png), before);
});
