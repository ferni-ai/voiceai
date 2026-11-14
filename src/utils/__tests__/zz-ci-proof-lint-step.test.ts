/**
 * Throwaway. One lint error on purpose (the `var` below), so CI shows the changed-test-files
 * lint step failing on a new test file. This file is never merged.
 */
import { expect, it } from 'vitest';

var leftover = 1;

it('carries one lint error on purpose', () => {
  expect(leftover).toBe(1);
});
