/**
 * Dream Tracking Domain Tools
 *
 * Voice-callable tools for the Dream Keeper superhuman service.
 * Never forget what they dreamed of becoming.
 *
 * DOMAIN: dream-tracking
 * TOOLS: checkDreams, findDormantDreams, recordDream
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { dreamKeeper } from '../../../services/superhuman/dream-keeper.js';
import type { DreamStatus, DreamType } from '../../../services/superhuman/dream-keeper.js';

const log = getLogger();

// ============================================================================
// HELPERS
// ============================================================================

function timeAgo(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'about a month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'about a year ago' : `${years} years ago`;
}

// ============================================================================
// TOOL 1: checkDreams
// ============================================================================

const checkDreamsDef: ToolDefinition = {
  id: 'checkDreams',
  name: 'Check Dreams',
  description: "Review the user's dreams and aspirations",
  domain: 'dream-tracking',
  tags: ['dreams', 'aspirations', 'goals', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Review the user's dreams and aspirations - what they've dreamed of becoming and doing",
      parameters: z.object({
        filter: z
          .enum(['all', 'alive', 'dormant', 'achieved'])
          .optional()
          .describe('Filter dreams by status (default: all)'),
      }),
      execute: async ({ filter }: { filter?: string }) => {
        try {
          log.info({ userId: ctx.userId, filter }, 'Checking dreams');
          const dreams = await dreamKeeper.loadDreams(ctx.userId);

          if (dreams.length === 0) {
            return "You haven't shared any dreams with me yet. I'd love to hear about what you dream of — big or small, practical or wild.";
          }

          const statusFilter = (filter || 'all') as 'all' | DreamStatus;
          const filtered =
            statusFilter === 'all' ? dreams : dreams.filter((d) => d.status === statusFilter);

          if (filtered.length === 0) {
            return `No ${statusFilter} dreams found. You have ${dreams.length} dream${dreams.length === 1 ? '' : 's'} total.`;
          }

          const lines: string[] = [`Here are your ${statusFilter === 'all' ? '' : statusFilter + ' '}dreams:\n`];

          for (const dream of filtered) {
            const ago = timeAgo(dream.firstMentioned);
            lines.push(
              `- "${dream.statement}" (${dream.type}, ${dream.status}) — first shared ${ago}`
            );
          }

          return lines.join('\n');
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to check dreams');
          return "I couldn't retrieve your dreams right now. Let's try again in a moment.";
        }
      },
    });
  },
};

// ============================================================================
// TOOL 2: findDormantDreams
// ============================================================================

const findDormantDreamsDef: ToolDefinition = {
  id: 'findDormantDreams',
  name: 'Find Dormant Dreams',
  description: "Find dreams the user hasn't mentioned in a while",
  domain: 'dream-tracking',
  tags: ['dreams', 'dormant', 'reignite', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Find dreams the user hasn't mentioned in a while that might need reigniting",
      parameters: z.object({}),
      execute: async () => {
        try {
          log.info({ userId: ctx.userId }, 'Finding dormant dreams');
          const reminders = await dreamKeeper.findDormant(ctx.userId);

          if (reminders.length === 0) {
            return "All your dreams are alive and well! None have gone dormant.";
          }

          const lines: string[] = [
            "Some dreams have been quiet for a while. No pressure — just a gentle nudge:\n",
          ];

          for (const reminder of reminders) {
            lines.push(`- "${reminder.dreamTitle}" — dormant for ${reminder.daysDormant} days`);
            lines.push(`  ${reminder.message}\n`);
          }

          return lines.join('\n');
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to find dormant dreams');
          return "I couldn't check on dormant dreams right now. Let's try again soon.";
        }
      },
    });
  },
};

// ============================================================================
// TOOL 3: recordDream
// ============================================================================

const DREAM_TYPES: [DreamType, ...DreamType[]] = [
  'career',
  'creative',
  'adventure',
  'relationship',
  'impact',
  'lifestyle',
  'growth',
  'healing',
];

const recordDreamDef: ToolDefinition = {
  id: 'recordDream',
  name: 'Record Dream',
  description: 'Record a new dream or aspiration the user has shared',
  domain: 'dream-tracking',
  tags: ['dreams', 'record', 'aspirations', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Record a new dream or aspiration the user has shared',
      parameters: z.object({
        statement: z.string().describe('The dream in their words'),
        type: z
          .enum(DREAM_TYPES)
          .describe(
            'Dream type: career, creative, adventure, relationship, impact, lifestyle, growth, or healing'
          ),
      }),
      execute: async ({ statement, type }: { statement: string; type: DreamType }) => {
        try {
          log.info({ userId: ctx.userId, type }, 'Recording dream');
          await dreamKeeper.recordMention(ctx.userId, {
            type,
            statement,
            confidence: 0.85,
          });

          return `I'll hold onto this dream for you: '${statement}'. I won't let you forget it.`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to record dream');
          return "I couldn't save that dream right now, but I heard you. Let's try again.";
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('dream-tracking', [
  checkDreamsDef,
  findDormantDreamsDef,
  recordDreamDef,
]);
