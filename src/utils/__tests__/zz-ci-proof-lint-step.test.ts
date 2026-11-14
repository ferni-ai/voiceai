/**
 * Throwaway. The planted lint error (a `var`) is fixed here, so CI shows the changed-test-files
 * lint step passing on the same new test file. This file is never merged.
 */
import { expect, it } from 'vitest';

const leftover = 1;

it('carried one lint error on purpose, now fixed', () => {
  expect(leftover).toBe(1);
});
