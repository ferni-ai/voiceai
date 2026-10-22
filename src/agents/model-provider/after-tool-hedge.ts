/**
 * LOOKUP_BRIDGE's switch and its hedge delay for the reply after a tool result
 * (see personas/lookup-bridge.ts). Here, below both, so the cascade can read
 * the delay without importing the persona layer.
 *
 * @module agents/model-provider/after-tool-hedge
 */

import { flagOn } from '../../config/env-flag.js';

type Env = Record<string, string | undefined>;

export function lookupBridgeOn(env: Env = process.env): boolean {
  return flagOn('LOOKUP_BRIDGE', env);
}

/** A non-negative number of ms from env, else the fallback. */
export function msFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** The hedge delay for the reply after a tool result, or undefined when the flag is off. */
export function afterToolHedgeMs(env: Env = process.env): number | undefined {
  return lookupBridgeOn(env) ? msFromEnv(env.LOOKUP_BRIDGE_HEDGE_MS, 500) : undefined;
}
