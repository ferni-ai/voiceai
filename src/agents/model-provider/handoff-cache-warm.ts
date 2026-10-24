/**
 * HANDOFF_CACHE_WARM=on: warm the incoming persona's prompt cache when a handoff
 * makes it the agent on the call.
 *
 * The only warm used to be the first greeting's (after-greeting.ts), and it stops
 * once the agent changes. The next persona sends a different prefix (its own
 * persona prompt and tools), so its first reply had nothing cached: on prod
 * (10-21..10-23) 26 of 34 turns after a handoff had 0 cached tokens, Peter 75%
 * and Nayan 78% of turns, at ~77-170 ms each (latency-2026-10-23 root-cause
 * report, fix 3).
 *
 * This arms the same warm (cache-warm.ts) on the incoming persona's Agent, so it
 * sends that Agent's own instructions, chat and tools (toolsForTurn), once its
 * tools settle; the warm is armed once per Agent, so one handoff warms once.
 * Fire-and-forget: it returns at once, never rejects, and the handoff doesn't
 * wait for it. The warm itself still needs CASCADE_CACHE_WARM (cacheWarmEnabled).
 *
 * @module agents/model-provider/handoff-cache-warm
 */
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HandoffCacheWarm' });

/** Arm the warm for the persona now on `session`. Never throws or rejects. */
export function warmIncomingPersona(
  session: unknown,
  env: Record<string, string | undefined> = process.env,
  settleMs?: number
): Promise<void> {
  if (!flagOn('HANDOFF_CACHE_WARM', env)) return Promise.resolve();
  // Loaded on use, like after-greeting.ts: cache-warm.ts pulls in the turn helpers.
  return import('./cache-warm.js')
    .then((m) => m.armPromptCacheWarm(session, env, settleMs))
    .catch((error: unknown) => log.warn({ error: String(error) }, 'handoff cache warm skipped'));
}
