/**
 * What runs once a call's greeting starts playing: the reply model's prompt
 * cache warm, once the tools settle and again when they change (cache-warm.ts,
 * CASCADE_CACHE_WARM / FIRST_TURN_FAST).
 *
 * A post-greeting STT socket refresh (STT_REFRESH_AFTER_GREETING, #521) used
 * to live here. It was removed: it fired on 6/6 dev calls but the first-turn
 * metric stayed ~1,066 ms, because that metric on turn 1 is measured from the
 * plugin's audio clock rather than VAD, so the "gain" was a metric artifact.
 * It was never turned on in prod.
 *
 * @module agents/model-provider/after-greeting
 */

import { armPromptCacheWarm } from './cache-warm.js';

/** Arms the prompt-cache warm for this call (no-op unless cache-warm.ts is enabled). */
export function run(session: unknown, env: Record<string, string | undefined> = process.env): void {
  armPromptCacheWarm(session, env);
}
