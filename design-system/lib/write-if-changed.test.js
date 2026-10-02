// node --test design-system/lib/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeIfChanged } from './write-if-changed.js';

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wic-')), 'out.ts');
const stamped = (time, body) => `/* Generated: ${time} */\n${body}\n`;

test('writes a missing file', () => {
  assert.equal(writeIfChanged(file, stamped('2026-01-01T00:00:00.000Z', 'a')), true);
});

test('leaves the file alone when only the timestamp moved', () => {
  assert.equal(writeIfChanged(file, stamped('2026-10-02T01:11:47.803Z', 'a')), false);
  assert.match(fs.readFileSync(file, 'utf8'), /2026-01-01T00:00:00.000Z/);
});

test('writes when the content changed', () => {
  assert.equal(writeIfChanged(file, stamped('2026-10-02T01:11:47.803Z', 'b')), true);
  assert.equal(fs.readFileSync(file, 'utf8'), stamped('2026-10-02T01:11:47.803Z', 'b'));
});
