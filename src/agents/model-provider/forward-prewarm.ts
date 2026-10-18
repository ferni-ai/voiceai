/**
 * Prewarm forwarding for LLMs that wrap other LLMs.
 *
 * @livekit/agents 1.9 calls `prewarm()` on the session's LLM whenever an agent
 * activity starts or resumes (handoffs included), so the first reply does not
 * pay DNS/TLS/auth setup. The base `LLM.prewarm()` does nothing unless the
 * class overrides `_prewarmImpl`, so a wrapper that only implements `chat()`
 * silently swallows it and the wrapped Gemini models are never warmed.
 *
 * @module agents/model-provider/forward-prewarm
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ForwardPrewarm' });

interface MaybePrewarmable {
  prewarm?: () => void;
  label?: (() => string) | string;
}

function nameOf(model: MaybePrewarmable): string {
  try {
    return typeof model.label === 'function' ? model.label() : String(model.label ?? 'unknown');
  } catch {
    return 'unknown';
  }
}

/**
 * Call `prewarm()` on each distinct inner model. A model without the method is
 * skipped; one that throws is logged (once per model, via `warned`) and the
 * rest still run. Never throws.
 */
export function forwardPrewarm(
  wrapper: string,
  models: readonly unknown[],
  warned: WeakSet<object>
): void {
  for (const model of new Set(models)) {
    if (typeof model !== 'object' || model === null) continue;
    const m = model as MaybePrewarmable;
    if (typeof m.prewarm !== 'function') continue;
    try {
      m.prewarm();
    } catch (error) {
      if (warned.has(model)) continue;
      warned.add(model);
      log.warn({ wrapper, model: nameOf(m), error: String(error) }, 'inner model prewarm failed');
    }
  }
}
