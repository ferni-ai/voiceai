/**
 * Gmail read is off (the link carries the calendar scope only), so a 403 from
 * Gmail means "not permitted", and the answer is never an empty inbox.
 * Everything here is behind GOOGLE_LINK_HONEST (config/google-link-honest.ts).
 *
 * @module services/gmail/gmail-honesty
 */

import { isGoogleLinkHonest } from '../../config/google-link-honest.js';
import type { Tool, ToolDefinition } from '../../tools/registry/types.js';

const GMAIL_NOT_PERMITTED = 'gmail_not_permitted';
const GMAIL_NOT_PERMITTED_SAY = "I can't read your Gmail. I'm only connected to your calendar.";

/** Gmail answered 403 (or a missing scope): this link may not read mail. */
export class GmailNotPermittedError extends Error {
  constructor() {
    super(GMAIL_NOT_PERMITTED);
    this.name = 'GmailNotPermittedError';
  }
}

interface GmailUnavailable {
  unavailable: typeof GMAIL_NOT_PERMITTED;
  say: string;
}

/** True for a Gmail response that means the grant lacks mail access. */
export function isGmailNotPermitted(status: number, body: string): boolean {
  return status === 403 || /insufficient\s*(authentication\s*)?(scopes?|permission)/i.test(body);
}

/** Runs a Gmail read; a not-permitted error becomes the honest result for the model. */
async function honestGmailRead<T>(run: () => Promise<T>): Promise<T | GmailUnavailable> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof GmailNotPermittedError)) throw error;
    return { unavailable: GMAIL_NOT_PERMITTED, say: GMAIL_NOT_PERMITTED_SAY };
  }
}

/**
 * Gmail read tools: not offered while the flag is on, and an honest answer if one
 * still runs. Off, the definitions come back untouched.
 */
export function honestGmailReadTools(defs: ToolDefinition[]): ToolDefinition[] {
  return defs.map((def) => ({
    ...def,
    availableWhen: () => !isGoogleLinkHonest(),
    create: (ctx) => {
      const tool: Tool = def.create(ctx);
      if (!isGoogleLinkHonest()) return tool;
      return {
        ...tool,
        execute: (...args: unknown[]) =>
          honestGmailRead(() => tool.execute(...args) as Promise<unknown>),
      };
    },
  }));
}
