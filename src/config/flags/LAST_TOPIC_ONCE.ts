import type { FlagSpec } from '../flag-spec.js';

// on: the greeting opens on last call's topic ("what you talked about last time") once per summary; after the hello has raised it, later calls leave it out until a new summary is written (agents/multi-agent/greeting-topic-once.ts). Off: every call's greeting may open on it, as before.
export const LAST_TOPIC_ONCE = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
} as const satisfies FlagSpec;
