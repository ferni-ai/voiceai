/**
 * QUICK_SHORTCUTS_REAL_ONLY=on: while ASSISTANT_ACTIONS_REAL is off, the
 * quickCall/quickText/quickEmail shortcuts are not offered.
 *
 * With actions off they can't do anything: they answer "use reachOut"
 * (shortcut-handoff.ts handOff), so the model calls reachOut next and the
 * caller waits one more model round trip, about 1 s (tool-turns audit
 * 2026-10-25, lever L3). Without the shortcuts the model calls reachOut or
 * callOnBehalf directly; both keep the read-back for a yes.
 *
 * Decided once per call, at the first request (the greeting's cache warm or
 * turn 1), and kept: a tool list that changes mid-call misses the prompt cache.
 *
 * @module agents/shared/quick-shortcuts-real-only
 */
import { llm } from '@livekit/agents';

import { isAssistantActionsReal } from '../../config/assistant-actions-flag.js';
import { flagOn } from '../../config/env-flag.js';

export const QUICK_SHORTCUT_TOOLS: ReadonlySet<string> = new Set([
  'quickCall',
  'quickText',
  'quickEmail',
]);

const decided = new WeakMap<object, boolean>();

/** Whether this call's requests leave the shortcuts out; fixed at the call's first ask. */
export function dropsQuickShortcuts(session: { readonly userData: unknown }): boolean {
  const key = typeof session.userData === 'object' && session.userData ? session.userData : session;
  let drop = decided.get(key);
  if (drop === undefined) {
    drop = flagOn('QUICK_SHORTCUTS_REAL_ONLY') && !isAssistantActionsReal();
    decided.set(key, drop);
  }
  return drop;
}

/** `toolCtx` without the shortcuts when this call drops them (the same object otherwise). */
export function withoutQuickShortcuts(
  toolCtx: llm.ToolContext,
  session: { readonly userData: unknown }
): llm.ToolContext {
  if (!dropsQuickShortcuts(session)) return toolCtx;
  const tools = Object.entries(toolCtx.functionTools);
  if (!tools.some(([name]) => QUICK_SHORTCUT_TOOLS.has(name))) return toolCtx;
  const keep = tools.filter(([name]) => !QUICK_SHORTCUT_TOOLS.has(name)).map(([, tool]) => tool);
  return new llm.ToolContext([...keep, ...toolCtx.providerTools]);
}
