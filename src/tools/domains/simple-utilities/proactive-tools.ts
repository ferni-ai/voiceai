/**
 * Proactive Utilities
 *
 * Tools for suggesting utilities and checking status proactively.
 *
 * @module simple-utilities/proactive-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getProactiveSuggestions, getUserPatterns } from './pattern-intelligence.js';
import { getProactiveOpener } from './proactive-hooks.js';
import { activeTimers } from './shared-state.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
const getUtilitySuggestionsDef: ToolDefinition = {
  id: 'getUtilitySuggestions',
  name: 'Get Utility Suggestions',
  description: 'Get proactive suggestions based on user patterns',
  domain: 'simple-utilities',
  tags: ['proactive', 'suggestion', 'anticipate'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getUtilitySuggestions'),
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        // Get in-memory pattern suggestions
        const patternSuggestions = getProactiveSuggestions(userId);

        // Get proactive opener from hooks (considers time of day, life context)
        const proactiveOpener = await getProactiveOpener(userId);

        const allSuggestions = [
          ...(proactiveOpener ? [proactiveOpener] : []),
          ...patternSuggestions,
        ];

        if (allSuggestions.length === 0) {
          return { hasSuggestions: false };
        }

        return {
          hasSuggestions: true,
          suggestions: allSuggestions,
          // Pick the top suggestion to offer
          topSuggestion: allSuggestions[0],
        };
      },
    });
  },
};

const checkTimerStatusDef: ToolDefinition = {
  id: 'checkTimerStatus',
  name: 'Check Timer Status',
  description: 'Check if there is an active timer and how much time remains',
  domain: 'simple-utilities',
  tags: ['timer', 'status', 'check'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('checkTimerStatus'),
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData?.userId || 'session';

        const timer = activeTimers.get(userId);
        if (!timer) {
          return "You don't have an active timer running. Want me to set one?";
        }

        const now = new Date();
        const remaining = timer.endTime.getTime() - now.getTime();

        if (remaining <= 0) {
          return `⏰ Your ${timer.label} timer just finished!`;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        let timeStr: string;
        if (minutes > 0) {
          timeStr =
            seconds > 0
              ? `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`
              : `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else {
          timeStr = `${seconds} second${seconds !== 1 ? 's' : ''}`;
        }

        return `⏱️ **${timeStr}** remaining on your ${timer.label} timer.`;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const proactiveToolDefinitions: ToolDefinition[] = [
  getUtilitySuggestionsDef,
  checkTimerStatusDef,
];

export { getUtilitySuggestionsDef, checkTimerStatusDef };
