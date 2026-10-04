/**
 * findTools: the model's way to reach a tool per-turn retrieval didn't send.
 *
 * Retrieval sends each request the tools the user's words point to (see
 * turn-tool-retrieval.ts). When it ranks the right one too low, the model can
 * describe what the user needs; the best matches the agent has become part of
 * the next request, including the model's next step in this same reply, and
 * the model calls the one that fits.
 *
 * @module tools/retrieval/find-tools-tool
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getTurnToolRetrieval } from './turn-tool-retrieval.js';

export const FIND_TOOLS = 'findTools';

export function createFindToolsTool() {
  return llm.tool({
    description:
      "Find the right tool when none of the ones you have fits what the user asked for (for example a timer, an alarm, a booking, a smart-home action). Describe what they need in a few words; matching tools become available to call right after. Don't use it for conversation.",
    parameters: z.object({
      need: z.string().describe('What the user wants done, in a few words'),
    }),
    execute: async ({ need }, { ctx }) => {
      const retrieval = getTurnToolRetrieval(ctx.session);
      if (!retrieval) return 'Tool lookup is unavailable right now; use the tools you have.';
      const found = await retrieval.find(need);
      if (found.length === 0) {
        return "No tool matches that. Tell the user plainly that you can't do it yet.";
      }
      return `These tools are now available; call the one that fits: ${found
        .map((f) => (f.description ? `${f.name} (${f.description})` : f.name))
        .join('; ')}`;
    },
  });
}
