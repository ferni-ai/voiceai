/**
 * Which linked account's token a tool call ran with, for its outcome line.
 *
 * A tool that reads a linked account's token (Google Calendar, Oura, LIFX,
 * Sonos...) should leave proof of WHOSE token ran on its "Tool execution
 * tracked" line (agents/voice-agent/tool-outcome.ts hashes the owner uid; it is
 * never logged in clear). The token read and the line happen in different
 * places, so:
 *   1. perCallerTool runs each tool call inside runWithLinkedTokenUse(toolCallId);
 *   2. the token read path calls noteLinkedTokenUse(provider, ownerUid, state);
 *   3. the tracking handler calls takeLinkedTokenUse(callId) for the finished call.
 * A read outside a scoped call (a background job, a tool not built through
 * perCallerTool) is not recorded.
 *
 * Who reports: the shared user token store (services/identity/
 * user-oauth-store.ts) on every read (connected / not_connected) and on a
 * blocked refresh (needs_reauth), and the shared refresh handler
 * (oauth-revocation.ts) on a revoked grant (needs_reauth), so a provider on the
 * store gets the fields with no change of its own. A provider can add its own
 * states (Google: expired with no refresh token; LIFX: unconfigured). The last
 * report in a call wins: link_state is the link's state, not the call's result.
 *
 * @module utils/linked-token-use
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** What a token read found. The first three are the shared store's LinkStatus states. */
export type LinkState = 'connected' | 'needs_reauth' | 'not_connected' | 'unconfigured';

export interface LinkedTokenUse {
  provider: string;
  /** In memory only, until the outcome line hashes it. */
  ownerUid: string;
  state: LinkState;
}

const scope = new AsyncLocalStorage<{ callId: string }>();
/** Calls' token reads waiting for their outcome line, oldest first. */
const pending = new Map<string, LinkedTokenUse>();
const MAX_PENDING = 256;

/** Run one tool call so a token read inside it is attributed to `callId`. */
export function runWithLinkedTokenUse<T>(callId: string | undefined, run: () => T): T {
  return callId ? scope.run({ callId }, run) : run();
}

/** A token read path's report. The last read in a call wins. */
export function noteLinkedTokenUse(provider: string, ownerUid: string, state: LinkState): void {
  const callId = scope.getStore()?.callId;
  if (!callId) return;
  pending.delete(callId);
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest !== undefined) pending.delete(oldest);
  }
  pending.set(callId, { provider, ownerUid, state });
}

/** The token read of a finished call, once. */
export function takeLinkedTokenUse(callId: string | undefined): LinkedTokenUse | undefined {
  if (!callId) return undefined;
  const use = pending.get(callId);
  pending.delete(callId);
  return use;
}
