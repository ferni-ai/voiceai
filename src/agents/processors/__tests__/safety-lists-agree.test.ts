/**
 * The casual filter keeps its own list of essentials. Every safety category (SAFETY_CATEGORIES,
 * the one list, beside it in intelligence/utils/injection-filter.ts) must be in it, or a casual
 * turn can drop it: the early-warning note ("provide crisis resources") was missing until
 * 2026-10-30 (#3088).
 */
import { expect, it } from 'vitest';
import { ESSENTIAL_CATEGORIES, SAFETY_CATEGORIES } from '../injection-filter.js';

it('every safety category is an essential the casual filter always keeps', () => {
  expect([...SAFETY_CATEGORIES].filter((c) => !ESSENTIAL_CATEGORIES.has(c))).toEqual([]);
});
