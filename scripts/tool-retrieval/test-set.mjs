// The frozen tool-choice test set (synthetic requests, no user data), pinned by hash: a changed
// file would silently move the metric. Resolved from this file, so any cwd works.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TEST_SET = new URL('./fixtures/choice-test-v1.json', import.meta.url);
export const TEST_SET_SHA256 = 'eaab17e8ce0487732e42713824d80f57caffed030785910ea5cf3dc2594d4f8b';

/** [{ query, tool }]; throws if the file isn't the reviewed v1 set. */
export function loadTestSet(file = TEST_SET) {
  const path = file instanceof URL ? fileURLToPath(file) : file;
  const text = readFileSync(path, 'utf8');
  const actual = createHash('sha256').update(text).digest('hex');
  if (actual !== TEST_SET_SHA256)
    throw new Error(
      `${path} is not the reviewed v1 set: expected sha256 ${TEST_SET_SHA256}, actual ${actual}. ` +
        'Leave v1 as it is; for new rows add fixtures/choice-test-v2.json and point TEST_SET and ' +
        'TEST_SET_SHA256 here at it (scores across versions are not comparable).'
    );
  return JSON.parse(text);
}
