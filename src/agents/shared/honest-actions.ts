/**
 * PROMPT_HONEST_ACTIONS: say only what a tool did, and say plainly when it can't.
 *
 * Real calls (2026-10-21/22, bth-calls-broken C4 and C6) had personas claim a
 * call was being placed when no tool ran, and state a UTC clock time as the
 * caller's "right now". The live prompt pushed both ways: Ferni's tool guidance
 * said "Never say 'I can't make calls'" and "if they want a call, make it", the
 * coaches' said "Never refuse to act on a clear request", and the shared
 * capabilities said "don't say you can't until a tool has told you so". The
 * tools on a turn are filtered (turn-request.ts), so the tool is often not
 * there, and those lines leave the model nothing honest to say.
 *
 * On: prompt-loader.ts reads the `.honest.md` sibling of each tool-guidance
 * file (read back a call, text or booking and wait for a yes; say so when the
 * tool isn't on this call; never say it's being done or done unless the tool
 * ran; promise away-time work only when a tool set it up), and world-now.ts
 * gives no clock time when the caller's zone is unknown. Off: the prompts are
 * byte-identical to before.
 *
 * @module agents/shared/honest-actions
 */
import { flagOn, type Env } from '../../config/env-flag.js';

export function honestActionsEnabled(env: Env = process.env): boolean {
  return flagOn('PROMPT_HONEST_ACTIONS', env);
}

/** `identity/tool-usage-guidance.md` → `identity/tool-usage-guidance.honest.md` when on. */
export function honestVariant(file: string, env: Env = process.env): string {
  return honestActionsEnabled(env) ? file.replace(/\.md$/, '.honest.md') : file;
}
