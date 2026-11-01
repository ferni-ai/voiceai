import type { FlagSpec } from '../flag-spec.js';

// on (with MEMORY_VIEW): the memory view also shows what Ferni has been pondering, read from bogle_users/{uid}/predictive_intelligence/pondering (intelligence/memory-view/known.ts). Only the ponder job (PONDERING) writes that doc, so a caller it never pondered gets an empty section, which the web hides. Off (the kill switch): the section is never read or sent, and a ponder item can't be forgotten from the view (404). Default on since 2026-10-31 (Seth); remove after 21 days prod soak.
export const MEMORY_VIEW_PONDERING = {
  default: 'on',
  owner: 'memory',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
