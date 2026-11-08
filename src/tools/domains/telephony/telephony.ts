/**
 * Calling the user: callUser ("call me") and scheduleCallback ("call me at 5").
 *
 * These tools used to answer "Calling you now at +1555…! Pick up, it's
 * important!" and "I'll give you a call tomorrow" while placing and storing
 * nothing, so Ferni promised calls that never came. Until a tool can really
 * place the call it says so, and offers what does work (a reminder), so the
 * model never tells the user something happened when it didn't.
 *
 * It says so once per call. A caller who kept asking heard the same refusal
 * and the same reminder offer five times in a row, word for word; after the
 * first refusal the tool tells the model it already said it.
 *
 * @module tools/domains/telephony/telephony
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { callSessionData } from '../../utils/call-session-data.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

/** What callUser returns when it can't ring the user's phone. */
export const CANT_CALL_NOW =
  "I can't ring your phone from here yet, so no call is coming. I can set a reminder for you instead. Want me to?";

/** What scheduleCallback returns when it can't store a call for later. */
export const CANT_SCHEDULE_CALL =
  "I can't schedule a call to your phone yet, so nothing is booked. I can set a reminder for that time instead. Want me to?";

/** What callUser returns when it already refused earlier in this call. */
export const ALREADY_SAID_CANT_CALL =
  "Already told them I can't ring their phone yet and offered a reminder. Don't repeat that offer and don't call this tool again this call; acknowledge briefly and move on.";

/** What scheduleCallback returns when it already refused earlier in this call. */
export const ALREADY_SAID_CANT_SCHEDULE =
  "Already told them I can't schedule a call to their phone yet and offered a reminder. Don't repeat that offer and don't call this tool again this call; acknowledge briefly and move on.";

type Refusal = 'callUser' | 'scheduleCallback';

const REPEAT_NOTE: Record<Refusal, string> = {
  callUser: ALREADY_SAID_CANT_CALL,
  scheduleCallback: ALREADY_SAID_CANT_SCHEDULE,
};

/** The refusals already given in each call, keyed by the call session's userData. */
const refusedInCall = new WeakMap<object, Set<Refusal>>();

/**
 * The full refusal the first time in this call, then a short note telling
 * the model it already said so. Without a call session to key on, always
 * the full refusal: better repeated than lost.
 */
export function refuseOnce(tool: Refusal, refusal: string, opts: unknown): string {
  const key = callSessionData(opts);
  if (!key) return refusal;
  const said = refusedInCall.get(key) ?? new Set<Refusal>();
  if (said.has(tool)) return REPEAT_NOTE[tool];
  said.add(tool);
  refusedInCall.set(key, said);
  return refusal;
}

export function createTelephonyTools() {
  return {
    callUser: llm.tool({
      description: getToolDescription('callUser'),
      parameters: z.object({
        reason: z.string().describe('Why the user wants the call (e.g., "check in", "wake me up")'),
      }),
      execute: async ({ reason }, opts) => {
        getLogger().info({ reason }, 'callUser: no call path, told the user honestly');
        return refuseOnce('callUser', CANT_CALL_NOW, opts);
      },
    }),

    scheduleCallback: llm.tool({
      description: getToolDescription('scheduleCallback'),
      parameters: z.object({
        when: z
          .string()
          .describe('When to call (e.g., "in 30 minutes", "tomorrow at 9am", "next Monday")'),
        reason: z.string().describe('What the call is about (e.g., "remind me to stretch")'),
      }),
      execute: async ({ when, reason }, opts) => {
        getLogger().info(
          { when, reason },
          'scheduleCallback: no call path, told the user honestly'
        );
        return refuseOnce('scheduleCallback', CANT_SCHEDULE_CALL, opts);
      },
    }),
  };
}

export default createTelephonyTools;
