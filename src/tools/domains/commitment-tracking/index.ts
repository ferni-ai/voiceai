/**
 * Commitment Tracking Domain Tools
 *
 * Voice-callable tools for the Commitment Keeper superhuman service.
 * Lets users check, follow up on, and update their commitments.
 *
 * DOMAIN: commitment-tracking
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ToolDomain } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { commitmentKeeper } from '../../../services/superhuman/commitment-keeper.js';

const log = getLogger();

// Domain name — will be added to ToolDomain union by the registration task
const DOMAIN = 'commitment-tracking' as ToolDomain;

// ============================================================================
// Tool 1: checkCommitments
// ============================================================================

const checkCommitmentsDef: ToolDefinition = {
  id: 'checkCommitments',
  name: 'Check Commitments',
  description: "Check the user's active commitments, promises, and goals",
  domain: DOMAIN,
  tags: ['commitment', 'accountability', 'goals'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description: "Check the user's active commitments, promises, and goals they've made",
      parameters: z.object({}),
      execute: async () => {
        try {
          const commitments = await commitmentKeeper.load(ctx.userId);

          if (commitments.length === 0) {
            return "You don't have any tracked commitments yet. When you make promises or set intentions during our conversations, I'll remember them.";
          }

          const now = Date.now();
          const lines = commitments.slice(0, 10).map((c) => {
            const daysAgo = Math.floor((now - c.createdAt) / (24 * 60 * 60 * 1000));
            const age = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
            return `- "${c.summary}" (${c.type}, made ${age})`;
          });

          const header =
            commitments.length === 1
              ? 'You have 1 active commitment:'
              : `You have ${commitments.length} active commitments:`;

          return `${header}\n${lines.join('\n')}`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to check commitments');
          return "I had trouble loading your commitments. Let's try again in a moment.";
        }
      },
    });
  },
};

// ============================================================================
// Tool 2: commitmentFollowUp
// ============================================================================

const commitmentFollowUpDef: ToolDefinition = {
  id: 'commitmentFollowUp',
  name: 'Commitment Follow-Up',
  description: 'Get follow-up messages for commitments due for a check-in',
  domain: DOMAIN,
  tags: ['commitment', 'follow-up', 'check-in'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description: 'Get follow-up messages for commitments that are due for a check-in',
      parameters: z.object({}),
      execute: async () => {
        try {
          const followUps = await commitmentKeeper.getFollowUps(ctx.userId);

          if (followUps.length === 0) {
            return 'No follow-ups needed right now. Your commitments are on track.';
          }

          const lines = followUps.map((f) => {
            const urgencyLabel = f.urgency === 'high' ? ' [important]' : '';
            return `- (${f.tone}${urgencyLabel}) ${f.message}`;
          });

          return `Here are some commitment check-ins:\n${lines.join('\n')}`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to get follow-ups');
          return "I had trouble checking on your commitments. Let's try again shortly.";
        }
      },
    });
  },
};

// ============================================================================
// Tool 3: updateCommitment
// ============================================================================

const updateCommitmentDef: ToolDefinition = {
  id: 'updateCommitment',
  name: 'Update Commitment',
  description: 'Update the status of a commitment',
  domain: DOMAIN,
  tags: ['commitment', 'update', 'status'],

  create: (ctx: ToolContext) => {
    return llm.tool({
      description:
        'Update the status of a commitment (mark as completed, deferred, or abandoned)',
      parameters: z.object({
        commitmentId: z.string().describe('The ID of the commitment to update'),
        newStatus: z
          .enum(['completed', 'deferred', 'abandoned'])
          .describe('The new status for this commitment'),
        reaction: z
          .string()
          .optional()
          .describe('How the user feels about this update'),
      }),
      execute: async (params: {
        commitmentId: string;
        newStatus: 'completed' | 'deferred' | 'abandoned';
        reaction?: string;
      }) => {
        try {
          await commitmentKeeper.updateStatus(
            ctx.userId,
            params.commitmentId,
            params.newStatus,
          );

          log.info(
            { userId: ctx.userId, commitmentId: params.commitmentId, status: params.newStatus },
            'Commitment updated via tool',
          );

          switch (params.newStatus) {
            case 'completed':
              return "That's amazing! Commitment marked as completed. You followed through, and that matters.";
            case 'deferred':
              return "No worries, I've put that on hold for now. We can come back to it whenever you're ready.";
            case 'abandoned':
              return "Got it, I've let that one go. Sometimes knowing what to stop is just as important as knowing what to start.";
          }
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId, commitmentId: params.commitmentId },
            'Failed to update commitment',
          );
          return "I had trouble updating that commitment. Let's try again.";
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(DOMAIN, [
  checkCommitmentsDef,
  commitmentFollowUpDef,
  updateCommitmentDef,
]);
