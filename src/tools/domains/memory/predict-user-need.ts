/**
 * predictUserNeed (moved out of tools-unified.ts): anticipate what the caller might need.
 *
 * A prediction is the model's own guess. Flag off it is written to memories as
 * "Prediction: …", where a later search can serve it as if the caller had said it.
 * With MEMORY_TOOLS_HONEST on nothing is written: the guess comes back labelled as a
 * guess, beside whatever stored memory relates (honest-memory.ts).
 *
 * @module tools/domains/memory/predict-user-need
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getUnifiedMemoryService } from '../../../services/unified-memory-service.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { guessReply, memoryToolsHonestOn } from './honest-memory.js';

const log = getLogger();

export const predictUserNeedUnifiedDef: ToolDefinition = {
  id: 'predictUserNeed',
  name: 'Predict User Need',
  description:
    'Anticipate what the user might need based on context, time, patterns, or upcoming events.',
  domain: 'memory',
  tags: ['memory', 'proactive', 'better-than-human', 'anticipatory', 'prediction', 'unified'],

  create: (ctx: ToolContext): Tool => {
    const memoryService = getUnifiedMemoryService();

    return llm.tool({
      description: getToolDescription('predictUserNeed'),
      parameters: z.object({
        context: z.string().describe('What triggered this prediction'),
        prediction: z.string().describe('What you predict they might need'),
        confidence: z
          .enum(['high', 'medium', 'low'])
          .describe('How confident you are in this prediction'),
        suggestedAction: z.string().optional().describe('Optional suggested action to take'),
      }),
      execute: async ({ context, prediction, confidence, suggestedAction }, { ctx: toolCtx }) => {
        log.info({ agentId: ctx.agentId, confidence }, '🔮 [BETTER-THAN-HUMAN] Predict user need');

        const userData = toolCtx.userData as { userId?: string };
        const userId = userData.userId || ctx.userId;

        if (memoryToolsHonestOn()) {
          // A guess is never stored as a memory; only what is stored is read beside it
          const found = userId
            ? await memoryService.search({ query: prediction, userId, limit: 2, minScore: 0.4 })
            : null;
          return guessReply(prediction, suggestedAction, found);
        }

        if (userId) {
          // Record the prediction for learning
          await memoryService.write({
            userId,
            content: `Prediction: ${prediction} (context: ${context})`,
            type: 'event',
            importance: confidence === 'high' ? 'high' : 'medium',
            metadata: {
              type: 'anticipatory_prediction',
              confidence,
              context,
              suggestedAction,
            },
          });

          // Search for relevant context to enhance prediction
          const result = await memoryService.search({
            query: prediction,
            userId,
            limit: 2,
            minScore: 0.4,
          });

          if (result) {
            return `Based on what I know about you: ${prediction}. ${result}`;
          }
        }

        return suggestedAction || prediction;
      },
    });
  },
};
