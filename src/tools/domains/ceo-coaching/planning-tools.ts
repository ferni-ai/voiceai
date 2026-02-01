/**
 * CEO Coaching Planning Tools
 *
 * Tools for strategic planning: priorities, blockers, decisions, and ideas.
 * These help executives maintain clarity on what matters most.
 *
 * TOOLS:
 *   - managePriorities: Add/reorder/complete priorities
 *   - trackBlocker: Add/resolve blockers
 *   - trackDecision: Track a decision
 *   - captureIdea: Capture an idea with tags
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import {
  addPriority,
  getPriorities,
  completePriority,
  reorderPriorities,
  addBlocker,
  resolveBlocker,
  getActiveBlockers,
  trackDecision,
  updateDecision,
  getPendingDecisions,
  captureIdea as saveIdea,
  getRecentIdeas,
} from './storage.js';

const log = getLogger();

// ============================================================================
// MANAGE PRIORITIES TOOL
// ============================================================================

export const managePrioritiesDef: ToolDefinition = {
  id: 'managePriorities',
  name: 'Manage Priorities',
  description: 'Add, view, complete, or reorder your priority stack',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'priorities', 'planning', 'focus'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Manage your priority stack. Add new priorities, mark them complete, view the current list, ' +
        'or reorder them. A clear priority stack keeps you focused on what matters most.',
      parameters: z.object({
        action: z
          .enum(['add', 'complete', 'list', 'reorder'])
          .describe('Action to perform on priorities'),
        text: z.string().optional().describe('Priority text (for add action)'),
        priorityId: z.string().optional().describe('Priority ID (for complete action)'),
        newOrder: z
          .array(z.string())
          .optional()
          .describe('Array of priority IDs in new order (for reorder action)'),
      }),
      execute: async ({ action, text, priorityId, newOrder }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to manage your priorities.';
        }

        log.info({ agentId: ctx.agentId, userId, action }, 'Managing priorities');

        try {
          if (action === 'add') {
            if (!text) {
              return 'What priority would you like to add?';
            }

            const priority = await addPriority(userId, text);
            const all = await getPriorities(userId);

            let response = `**Priority Added** ✅\n\n`;
            response += `"${text}"\n\n`;
            response += `**Current Stack** (${all.length} priorities)\n`;
            all.slice(0, 5).forEach((p, i) => {
              const marker = p.id === priority.id ? ' ← new' : '';
              response += `${i + 1}. ${p.text}${marker}\n`;
            });

            return response;
          } else if (action === 'complete') {
            if (!priorityId) {
              // Show list to pick from
              const all = await getPriorities(userId);
              if (all.length === 0) {
                return 'No active priorities to complete.';
              }

              let response = `**Which priority did you complete?**\n\n`;
              all.forEach((p, i) => {
                response += `${i + 1}. ${p.text} (ID: ${p.id})\n`;
              });
              return response;
            }

            await completePriority(userId, priorityId);
            const remaining = await getPriorities(userId);

            let response = `**Priority Completed** 🎉\n\n`;
            if (remaining.length > 0) {
              response += `**Remaining priorities:**\n`;
              remaining.forEach((p, i) => {
                response += `${i + 1}. ${p.text}\n`;
              });
            } else {
              response += `All priorities cleared! Time to set new ones?`;
            }

            return response;
          } else if (action === 'list') {
            const all = await getPriorities(userId);

            if (all.length === 0) {
              return "**No active priorities.** What's most important right now?";
            }

            let response = `**Priority Stack** (${all.length} items)\n\n`;
            all.forEach((p, i) => {
              response += `${i + 1}. ${p.text}\n`;
            });
            response += `\n---\nWhat would you like to focus on?`;

            return response;
          } else if (action === 'reorder') {
            if (!newOrder || newOrder.length === 0) {
              const all = await getPriorities(userId);
              let response = `**Current order:**\n`;
              all.forEach((p, i) => {
                response += `${i + 1}. ${p.text}\n`;
              });
              response += `\nTell me the new order you'd like.`;
              return response;
            }

            await reorderPriorities(userId, newOrder);
            const reordered = await getPriorities(userId);

            let response = `**Priorities Reordered** ✅\n\n`;
            reordered.forEach((p, i) => {
              response += `${i + 1}. ${p.text}\n`;
            });

            return response;
          }

          return "I didn't understand that action.";
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to manage priorities');
          return 'I had trouble with that. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// TRACK BLOCKER TOOL
// ============================================================================

export const trackBlockerDef: ToolDefinition = {
  id: 'trackBlocker',
  name: 'Track Blocker',
  description: 'Add or resolve blockers that are preventing progress',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'blockers', 'obstacles', 'planning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Track blockers that are preventing progress. Naming blockers explicitly makes them easier ' +
        'to address. Mark them resolved when you overcome them.',
      parameters: z.object({
        action: z.enum(['add', 'resolve', 'list']).describe('Action to perform'),
        text: z.string().optional().describe('Blocker description (for add action)'),
        blockerId: z.string().optional().describe('Blocker ID (for resolve action)'),
        resolution: z.string().optional().describe('How the blocker was resolved'),
      }),
      execute: async ({ action, text, blockerId, resolution }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to track blockers.';
        }

        log.info({ agentId: ctx.agentId, userId, action }, 'Tracking blocker');

        try {
          if (action === 'add') {
            if (!text) {
              return "What's blocking you?";
            }

            await addBlocker(userId, text);
            const all = await getActiveBlockers(userId);

            let response = `**Blocker Added** ⚠️\n\n`;
            response += `"${text}"\n\n`;
            response += `**Active Blockers** (${all.length})\n`;
            all.forEach((b) => {
              response += `- ${b.text}\n`;
            });
            response += `\nWhat could unblock this?`;

            return response;
          } else if (action === 'resolve') {
            if (!blockerId) {
              const all = await getActiveBlockers(userId);
              if (all.length === 0) {
                return 'No active blockers to resolve!';
              }

              let response = `**Which blocker was resolved?**\n\n`;
              all.forEach((b, i) => {
                response += `${i + 1}. ${b.text} (ID: ${b.id})\n`;
              });
              return response;
            }

            await resolveBlocker(userId, blockerId, resolution);

            let response = `**Blocker Resolved** 🎉\n\n`;
            if (resolution) {
              response += `Resolution: ${resolution}\n`;
            }

            const remaining = await getActiveBlockers(userId);
            if (remaining.length > 0) {
              response += `\n**${remaining.length} blockers remaining**`;
            } else {
              response += `\nNo more blockers! Clear path ahead.`;
            }

            return response;
          } else if (action === 'list') {
            const all = await getActiveBlockers(userId);

            if (all.length === 0) {
              return '**No active blockers!** The path is clear.';
            }

            let response = `**Active Blockers** (${all.length})\n\n`;
            all.forEach((b, i) => {
              response += `${i + 1}. ${b.text}\n`;
            });
            response += `\nWhich one should we tackle?`;

            return response;
          }

          return "I didn't understand that action.";
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to track blocker');
          return 'I had trouble with that. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// TRACK DECISION TOOL
// ============================================================================

export const trackDecisionDef: ToolDefinition = {
  id: 'trackDecision',
  name: 'Track Decision',
  description: 'Track important decisions that need to be made or have been made',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'decisions', 'planning', 'leadership'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Track decisions. Capture pending decisions you need to make, and record outcomes when you ' +
        'make them. This creates a decision journal for learning and accountability.',
      parameters: z.object({
        action: z.enum(['add', 'make', 'list']).describe('Action to perform'),
        description: z.string().optional().describe('Decision description (for add action)'),
        context: z.string().optional().describe('Why this decision matters'),
        decisionId: z.string().optional().describe('Decision ID (for make action)'),
        outcome: z.string().optional().describe('What you decided and why'),
      }),
      execute: async ({ action, description, context, decisionId, outcome }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to track decisions.';
        }

        log.info({ agentId: ctx.agentId, userId, action }, 'Tracking decision');

        try {
          if (action === 'add') {
            if (!description) {
              return 'What decision do you need to make?';
            }

            await trackDecision(userId, description, context);
            const all = await getPendingDecisions(userId);

            let response = `**Decision Tracked** 🤔\n\n`;
            response += `"${description}"\n`;
            if (context) {
              response += `Context: ${context}\n`;
            }
            response += `\n**Pending Decisions** (${all.length})\n`;

            return response;
          } else if (action === 'make') {
            if (!decisionId) {
              const all = await getPendingDecisions(userId);
              if (all.length === 0) {
                return "No pending decisions. What's on your mind?";
              }

              let response = `**Which decision did you make?**\n\n`;
              all.forEach((d, i) => {
                response += `${i + 1}. ${d.description} (ID: ${d.id})\n`;
              });
              return response;
            }

            await updateDecision(userId, decisionId, { status: 'made', outcome });

            let response = `**Decision Made** ✅\n\n`;
            if (outcome) {
              response += `Outcome: ${outcome}\n`;
            }
            response += `\nDecisions only matter when followed by action. What's the next step?`;

            return response;
          } else if (action === 'list') {
            const all = await getPendingDecisions(userId);

            if (all.length === 0) {
              return "**No pending decisions.** Clarity on what's decided!";
            }

            let response = `**Pending Decisions** (${all.length})\n\n`;
            all.forEach((d, i) => {
              response += `${i + 1}. ${d.description}\n`;
              if (d.context) {
                response += `   Context: ${d.context}\n`;
              }
            });

            return response;
          }

          return "I didn't understand that action.";
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to track decision');
          return 'I had trouble with that. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// CAPTURE IDEA TOOL
// ============================================================================

export const captureIdeaDef: ToolDefinition = {
  id: 'captureIdea',
  name: 'Capture Idea',
  description: 'Quickly capture an idea before it escapes',
  domain: 'ceo-coaching',
  tags: ['ceo', 'coaching', 'ideas', 'brainstorm', 'capture'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Capture an idea. Ideas are fleeting - capture them quickly before they disappear. ' +
        'Add optional tags to organize them for later review.',
      parameters: z.object({
        text: z.string().describe('The idea to capture'),
        tags: z.array(z.string()).optional().describe('Optional tags to categorize the idea'),
      }),
      execute: async ({ text, tags = [] }) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to capture your idea.';
        }

        log.info({ agentId: ctx.agentId, userId, tagCount: tags.length }, 'Capturing idea');

        try {
          await saveIdea(userId, text, tags);
          const recentIdeas = await getRecentIdeas(userId, 5);

          let response = `**Idea Captured** 💡\n\n`;
          response += `"${text}"\n`;
          if (tags.length > 0) {
            response += `Tags: ${tags.join(', ')}\n`;
          }

          response += `\n**Recent Ideas** (${recentIdeas.length})\n`;
          recentIdeas.slice(0, 3).forEach((idea) => {
            const truncated =
              idea.text.length > 50 ? idea.text.substring(0, 50) + '...' : idea.text;
            response += `- ${truncated}\n`;
          });

          return response;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to capture idea');
          return 'I had trouble capturing that. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const planningTools: ToolDefinition[] = [
  managePrioritiesDef,
  trackBlockerDef,
  trackDecisionDef,
  captureIdeaDef,
];
