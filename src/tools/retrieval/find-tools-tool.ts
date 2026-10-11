/**
 * findTools: the model's way to reach a tool per-turn retrieval didn't send.
 *
 * Retrieval sends each request the tools the user's words point to (see
 * turn-tool-retrieval.ts). When it ranks the right one too low, the model can
 * describe what the user needs; the best matches the agent has become part of
 * the next request, including the model's next step in this same reply, and
 * the model calls the one that fits.
 *
 * TOOL_CORE_STATIC: it searches the whole catalog's findable domains and the
 * session's pinner adds the matches to the agent for the rest of the call,
 * this reply's next step included (turn-request.ts).
 *
 * @module tools/retrieval/find-tools-tool
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { staticCoreToolsEnabled } from '../../config/tool-config.js';
import { getTurnToolRetrieval } from './turn-tool-retrieval.js';

export const FIND_TOOLS = 'findTools';

export interface FoundTool {
  name: string;
  description: string;
}

/** Adds the named tools to the session's agent; returns the ones it now has. `need` is for the audit log. */
export type ToolPinner = (names: readonly string[], need: string) => Promise<FoundTool[]>;

// Keyed by the AgentSession, like the retrieval itself.
const pinners = new WeakMap<object, ToolPinner>();

export function setToolPinner(session: object, pinner: ToolPinner | null): void {
  if (pinner) pinners.set(session, pinner);
  else pinners.delete(session);
}

const UNAVAILABLE = 'Tool lookup is unavailable right now; use the tools you have.';
const NO_MATCH = "No tool matches that. Tell the user plainly that you can't do it yet.";

export function createFindToolsTool() {
  return llm.tool({
    description:
      "Find the right tool when none of the ones you have fits what the user asked for (for example a timer, an alarm, a booking, a smart-home action). Describe what they need in a few words; matching tools become available to call right after. Don't use it for conversation.",
    parameters: z.object({
      need: z.string().describe('What the user wants done, in a few words'),
    }),
    execute: async ({ need }, { ctx }) => {
      const retrieval = getTurnToolRetrieval(ctx.session);
      if (!retrieval) return UNAVAILABLE;
      let found: FoundTool[];
      if (staticCoreToolsEnabled()) {
        const pin = pinners.get(ctx.session);
        if (!pin) return UNAVAILABLE;
        const matches = await retrieval.find(need, 5, { anyTool: true });
        found =
          matches.length > 0
            ? await pin(
                matches.map((m) => m.name),
                need
              )
            : [];
      } else {
        found = await retrieval.find(need);
      }
      if (found.length === 0) return NO_MATCH;
      return `These tools are now available; call the one that fits: ${found
        .map((f) => (f.description ? `${f.name} (${f.description})` : f.name))
        .join('; ')}`;
    },
  });
}
