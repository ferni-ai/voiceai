/**
 * Calling the user: callUser ("call me") and scheduleCallback ("call me at 5").
 *
 * These tools used to answer "Calling you now at +1555…! Pick up, it's
 * important!" and "I'll give you a call tomorrow" while placing and storing
 * nothing, so Ferni promised calls that never came. Until a tool can really
 * place the call it says so, and offers what does work (a reminder), so the
 * model never tells the user something happened when it didn't.
 *
 * @module tools/domains/telephony/telephony
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

/** What callUser returns when it can't ring the user's phone. */
export const CANT_CALL_NOW =
  "I can't ring your phone from here yet, so no call is coming. I can set a reminder for you instead. Want me to?";

/** What scheduleCallback returns when it can't store a call for later. */
export const CANT_SCHEDULE_CALL =
  "I can't schedule a call to your phone yet, so nothing is booked. I can set a reminder for that time instead. Want me to?";

export function createTelephonyTools() {
  return {
    callUser: llm.tool({
      description: getToolDescription('callUser'),
      parameters: z.object({
        reason: z.string().describe('Why the user wants the call (e.g., "check in", "wake me up")'),
      }),
      execute: async ({ reason }) => {
        getLogger().info({ reason }, 'callUser: no call path, told the user honestly');
        return CANT_CALL_NOW;
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
      execute: async ({ when, reason }) => {
        getLogger().info({ when, reason }, 'scheduleCallback: no call path, told the user honestly');
        return CANT_SCHEDULE_CALL;
      },
    }),
  };
}

export default createTelephonyTools;
