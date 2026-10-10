/**
 * What runs once a call's greeting starts playing.
 *
 * - The reply model's prompt cache warm, once the tools settle and again when
 *   they change (cache-warm.ts, CASCADE_CACHE_WARM).
 * - STT_REFRESH_AFTER_GREETING=on: when the greeting finishes, reopen the
 *   Cartesia socket. Ink-2 ends a stream's first turn later the longer the
 *   socket has been open (~0.6 s at 2-9 s old vs ~0.94 s at 20 s), and a call's
 *   first words come ~20 s after it opens; the greeting cannot be interrupted,
 *   so the caller has not started talking when it ends. Live probe through the
 *   patched plugin: first turn 700/700/870 ms with the refresh vs 1,043/1,025/
 *   1,029 ms without (2026-10-10).
 *
 * @module agents/model-provider/after-greeting
 */

import { createLogger } from '../../utils/safe-logger.js';
import { armPromptCacheWarm } from './cache-warm.js';
import { refreshSttStream } from './cartesia-cascade.js';

const log = createLogger({ module: 'AfterGreeting' });

interface StateChange {
  oldState?: string;
  newState?: string;
}

interface SessionView {
  stt?: unknown;
  on?: (event: string, handler: (ev: StateChange) => void) => unknown;
  off?: (event: string, handler: (ev: StateChange) => void) => unknown;
}

/** Refresh the STT socket the first time the agent stops speaking. */
export function armSttRefresh(
  session: unknown,
  env: Record<string, string | undefined> = process.env,
  giveUpMs = 60_000
): void {
  if (env.STT_REFRESH_AFTER_GREETING !== 'on') return;
  const s = session as SessionView | undefined;
  if (!s?.on || !s.off || !s.stt) return;
  const off = (): void => {
    clearTimeout(timer);
    s.off?.('agent_state_changed', onState);
  };
  const onState = (ev: StateChange): void => {
    if (ev.oldState !== 'speaking') return;
    off();
    log.info({ refreshed: refreshSttStream(s.stt) }, 'STT_REFRESH_AFTER_GREETING');
  };
  const timer = setTimeout(off, giveUpMs);
  timer.unref?.();
  s.on('agent_state_changed', onState);
}

/** Never throws. */
export function run(session: unknown, env: Record<string, string | undefined> = process.env): void {
  try {
    armSttRefresh(session, env);
  } catch (error) {
    log.warn({ error: String(error) }, 'stt refresh not armed');
  }
  armPromptCacheWarm(session, env);
}
