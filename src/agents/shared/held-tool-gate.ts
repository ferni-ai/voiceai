/**
 * MINOR_CARE at the dispatcher: a held caller's tool calls keep nothing.
 *
 * Text chat (api/chat-minor-care.ts) reads a voice call's hold where the writers can't
 * (utils/minor-care.ts holds live in the voice process) and passes it as ctx.held. Most writers
 * check only writeHeld, so the hold is enforced once, here, before any executor or side effect
 * (learning loop, action tracker, webhooks). Fail closed: only the read-only tools below run;
 * every other tool, alias or unknown name is a no-op that reports nothing about why.
 *
 * @module agents/shared/held-tool-gate
 */

/** Read-only tools a held caller may still use (lower case, exact names; no aliases). */
export const READ_ONLY_WHEN_HELD: ReadonlySet<string> = new Set([
  'recallfrommemory', // memory-executor: reads facts and the index
  'getweather', // information-executor: an outside forecast
  'gethabitstreak', // habits-executor: reads one habit doc
  'getunreademails', // communication/gmail-tools: reads the inbox
]);

/** True when this call must not run: the caller is held and the tool isn't read-only. */
export function heldWriter(fn: string, held: boolean | undefined): boolean {
  return held === true && !READ_ONLY_WHEN_HELD.has(fn.toLowerCase());
}
