/**
 * Gmail read is not granted: the Google link carries the calendar scope only, and
 * gmail.readonly needs Google's restricted-scope review (CASA), which is not planned.
 * So every Gmail read meets a 401/403, and the answer must never be an empty inbox.
 *
 * GMAIL_READ_TOOLS (off by default): the read tools are offered only when it is on.
 * The honest path (a 401/403, a missing scope or no token reads as "not connected")
 * runs when GMAIL_READ_TOOLS or GOOGLE_LINK_HONEST is on.
 *
 * @module services/gmail/gmail-honesty
 */

import { isGmailReadToolsOn } from '../../config/gmail-read-tools.js';
import { isGoogleLinkHonest } from '../../config/google-link-honest.js';
import type { Tool, ToolDefinition } from '../../tools/registry/types.js';

const GMAIL_NOT_PERMITTED = 'gmail_not_permitted';
const GMAIL_UNREACHABLE = 'gmail_unreachable';

/** What Ferni says when Gmail can't be read. No connect offer: no flow grants read access. */
export const GMAIL_READ_NOT_CONNECTED = "I can't read your inbox; that isn't connected.";
const GMAIL_UNREACHABLE_SAY = "I couldn't reach your inbox just now, so I can't say what's in it.";

/** True when a Gmail failure must be reported, not read as an empty inbox. */
export function gmailReadsHonest(): boolean {
  return isGmailReadToolsOn() || isGoogleLinkHonest();
}

/** Gmail answered 401/403 (or a missing scope), or there is no token: this link may not read mail. */
export class GmailNotPermittedError extends Error {
  constructor() {
    super(GMAIL_NOT_PERMITTED);
    this.name = 'GmailNotPermittedError';
  }
}

/** A Gmail read failed for another reason (5xx, timeout, open breaker): nothing is known. */
export class GmailUnreachableError extends Error {
  constructor() {
    super(GMAIL_UNREACHABLE);
    this.name = 'GmailUnreachableError';
  }
}

export interface GmailUnavailable {
  unavailable: typeof GMAIL_NOT_PERMITTED | typeof GMAIL_UNREACHABLE;
  say: string;
}

/** The typed result for a Gmail read that can't run. */
export function gmailNotConnected(): GmailUnavailable {
  return { unavailable: GMAIL_NOT_PERMITTED, say: GMAIL_READ_NOT_CONNECTED };
}

/**
 * Honest path on: a Gmail 401/403 (or a missing-scope body) throws GmailNotPermittedError,
 * which the callers must not turn into an empty inbox. Off: nothing happens, as before.
 */
export function assertGmailPermitted(status: number, body: string): void {
  if (!gmailReadsHonest()) return;
  if (
    status === 401 ||
    status === 403 ||
    /insufficient\s*(authentication\s*)?(scopes?|permission)/i.test(body)
  ) {
    throw new GmailNotPermittedError();
  }
}

/** Runs a Gmail read; a not-permitted or unreachable error becomes the honest result for the model. */
async function honestGmailRead<T>(run: () => Promise<T>): Promise<T | GmailUnavailable> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GmailNotPermittedError) return gmailNotConnected();
    if (error instanceof GmailUnreachableError) {
      return { unavailable: GMAIL_UNREACHABLE, say: GMAIL_UNREACHABLE_SAY };
    }
    throw error;
  }
}

/**
 * Gmail read tools: offered only under GMAIL_READ_TOOLS, and a failed read is an
 * honest answer, never an empty inbox.
 */
export function honestGmailReadTools(defs: ToolDefinition[]): ToolDefinition[] {
  return defs.map((def) => ({
    ...def,
    availableWhen: () => isGmailReadToolsOn(),
    create: (ctx) => {
      const tool: Tool = def.create(ctx);
      return {
        ...tool,
        execute: (...args: unknown[]) =>
          honestGmailRead(() => tool.execute(...args) as Promise<unknown>),
      };
    },
  }));
}
