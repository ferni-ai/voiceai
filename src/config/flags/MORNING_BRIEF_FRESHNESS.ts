import type { FlagSpec } from '../flag-spec.js';

// on: the morning brief leaves out a todo that was closed, changed, already raised in the last 48 h, or talked about since it was last listed, and an owner turn naming a todo is noted for that (morning-brief/freshness.ts, agents/follow-through-close.ts). Drop-only: it never adds an item. Safety items are never dropped.
export const MORNING_BRIEF_FRESHNESS = {
  default: 'on',
  owner: 'outreach',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
