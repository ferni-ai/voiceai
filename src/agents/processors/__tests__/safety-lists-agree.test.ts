/**
 * The casual filter (intelligence/utils/injection-filter.ts) keeps its own list of essentials:
 * the layer rule bars intelligence/ from importing agents/. Every safety category
 * (safety-note.ts, the one list) must be in it, or a casual turn can drop it: the early-warning
 * note ("provide crisis resources") was missing from both copies until 2026-10-30 (#3088).
 */
import { expect, it } from 'vitest';
import { SAFETY_CATEGORIES } from '../turn-processor/safety-note.js';
import { ESSENTIAL_CATEGORIES } from '../../../intelligence/utils/injection-filter.js';

it('every safety category is an essential the casual filter always keeps', () => {
  expect([...SAFETY_CATEGORIES].filter((c) => !ESSENTIAL_CATEGORIES.has(c))).toEqual([]);
});
