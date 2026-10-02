/**
 * setMemoryConsent — the user's voice switch for sensitive memory
 * ("stop remembering my health stuff", "yes, you can remember that").
 * Backed by services/memory-consent.
 *
 * @module tools/domains/memory/consent-tool
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { handleConsentVoice } from '../../../services/memory-consent/voice.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

export const setMemoryConsentSchema = z.object({
  category: z
    .enum(['health', 'finances', 'beliefs', 'all'])
    .describe('health (incl. mood), finances (money), beliefs (faith), or all three'),
  enabled: z
    .boolean()
    .optional()
    .describe('true = may remember, false = stop remembering. Default true.'),
  deleteExisting: z
    .boolean()
    .optional()
    .describe('true only after the user said yes to deleting what is already stored'),
});

export type SetMemoryConsentArgs = z.infer<typeof setMemoryConsentSchema>;

export function setMemoryConsent(
  args: SetMemoryConsentArgs,
  ctx: { userId?: string }
): Promise<string> {
  return handleConsentVoice(ctx.userId, args);
}

export const setMemoryConsentDef: ToolDefinition = {
  id: 'setMemoryConsent',
  name: 'Set Memory Consent',
  description: 'Turn remembering health, money or faith details on or off for the user',
  domain: 'memory',
  tags: ['memory', 'privacy', 'consent', 'health'],

  create: (ctx: ToolContext): Tool =>
    llm.tool({
      description: getToolDescription('setMemoryConsent'),
      parameters: setMemoryConsentSchema,
      execute: async (args) => {
        getLogger().info(
          { agentId: ctx.agentId, category: args.category, enabled: args.enabled },
          'Memory consent change requested'
        );
        return setMemoryConsent(args, { userId: ctx.userId });
      },
    }),
};
