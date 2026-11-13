/**
 * The size cap shared by the per-call context stores (inbound caller,
 * outbound call, proactive reason).
 *
 * Each call's context is released at call end (releaseCallTypeContexts in
 * voice-agent-entry/metadata-parser.ts). The cap is the backstop for a call
 * whose end never ran: a long-lived worker serves call after call, so a missed
 * release would otherwise keep that context until the process exits.
 *
 * @module intelligence/context-builders/external/call-context-cap
 */

import { setCapped } from '../../../utils/capped-map.js';
import type { FallbackLogger } from '../../../utils/safe-logger.js';

/** About 1,000 calls: setup stores each call under its session id and its room. */
const CALL_CONTEXT_MAX_KEYS = 2_000;

/** Store a call's context, dropping the oldest entries past the cap. */
export function storeCallContext<V>(
  store: Map<string, V>,
  key: string,
  context: V,
  log: FallbackLogger
): void {
  const dropped = setCapped(store, key, context, CALL_CONTEXT_MAX_KEYS);
  // Counts only: the keys are session ids and room names.
  if (dropped > 0)
    log.warn({ dropped, kept: store.size }, 'Call context store full: dropped the oldest');
}
