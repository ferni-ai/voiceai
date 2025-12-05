/**
 * Expression Tool - Allows agents to push visual emoji expressions
 *
 * Agents can call this to morph the waveform into meaningful emoji shapes,
 * creating delightful visual moments during conversation.
 */

import { z } from 'zod';
import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// PERSONA EXPRESSIONS - What each agent can express
// ============================================================================

export const PERSONA_EXPRESSIONS = {
  'jack-b': {
    signature: '☕',
    available: ['☕', '💡', '🎯', '🤝', '⭐', '🌟', '👋', '💪'],
    descriptions: {
      '☕': "Welcome, warmth, let's chat",
      '💡': 'Great idea, insight',
      '🎯': 'Goal setting, targeting',
      '🤝': 'Partnership, collaboration',
      '⭐': 'Great job, celebration',
      '🌟': 'Progress, growth',
      '👋': 'Hello, greeting',
      '💪': 'Encouragement, strength',
    },
  },
  'nayan-patel': {
    signature: '📈',
    available: ['📈', '🏦', '📊', '🐢', '💎', '🎓', '⏰', '🌱'],
    descriptions: {
      '📈': 'Growth, compounding',
      '🏦': 'Savings, wealth building',
      '📊': 'Data, analysis',
      '🐢': 'Patience, slow and steady',
      '💎': 'Valuable insight',
      '🎓': 'Learning, education',
      '⏰': 'Time in market',
      '🌱': 'Seeds of wealth',
    },
  },
  'peter-john': {
    signature: '🔥',
    available: ['🔥', '🎯', '💎', '🚀', '🔍', '🏆', '⚡', '💰'],
    descriptions: {
      '🔥': 'Hot opportunity',
      '🎯': 'Target stock',
      '💎': 'Hidden gem',
      '🚀': 'Growth potential',
      '🔍': 'Research time',
      '🏆': 'Winner',
      '⚡': 'Quick insight',
      '💰': 'Money maker',
    },
  },
  'comm-specialist': {
    signature: '📧',
    available: ['📧', '📅', '📱', '✅', '🔔', '💬', '📝', '🎤'],
    descriptions: {
      '📧': 'Email ready',
      '📅': 'Scheduled',
      '📱': 'Call queued',
      '✅': 'Done, complete',
      '🔔': 'Reminder set',
      '💬': 'Message sent',
      '📝': 'Note taken',
      '🎤': 'Voice message',
    },
  },
  'spend-save': {
    signature: '💰',
    available: ['💰', '🐷', '💳', '📉', '🎯', '🌱', '💵', '🏦'],
    descriptions: {
      '💰': 'Money talk',
      '🐷': 'Saving up',
      '💳': 'Spending check',
      '📉': 'Cutting costs',
      '🎯': 'Budget goal',
      '🌱': 'Growing savings',
      '💵': 'Cash flow',
      '🏦': 'Bank account',
    },
  },
  'event-planner': {
    signature: '🎉',
    available: ['🎉', '✈️', '🏠', '🚗', '📆', '🎁', '🌴', '🎊'],
    descriptions: {
      '🎉': 'Celebration',
      '✈️': 'Travel plans',
      '🏠': 'Home goals',
      '🚗': 'Car plans',
      '📆': 'Planning ahead',
      '🎁': 'Special moment',
      '🌴': 'Vacation',
      '🎊': 'Party time',
    },
  },
} as const;

type PersonaId = keyof typeof PERSONA_EXPRESSIONS;

// ============================================================================
// EXPRESSION TOOL
// ============================================================================

let currentAgentId: PersonaId = 'jack-b';

/**
 * Set the current agent for expression context.
 */
export function setExpressionAgent(agentId: string): void {
  if (agentId in PERSONA_EXPRESSIONS) {
    currentAgentId = agentId as PersonaId;
    getLogger().info({ agentId }, 'Expression agent set');
  }
}

/**
 * Create expression tool for the current agent.
 */
export function createExpressionTool() {
  const logger = getLogger();

  return {
    express: llm.tool({
      description: `Express a meaningful moment visually by morphing the waveform into an emoji shape. 
Use this sparingly for impactful moments - greetings, achievements, insights, or emotional highlights.
Available expressions depend on your persona.

Examples of when to use:
- Greeting a user: "Hello! 👋"
- User achieves a goal: "Great job! ⭐"
- Sharing an insight: "Here's a valuable insight 💎"
- Completing a task: "Done! ✅"
- Celebrating: "Let's celebrate! 🎉"`,
      parameters: z.object({
        emoji: z.string().describe('The emoji to express (must be from your available set)'),
        meaning: z.string().optional().describe('Optional: what this expression means'),
      }),
      execute: async ({ emoji, meaning }) => {
        const personaConfig = PERSONA_EXPRESSIONS[currentAgentId];

        // Validate emoji is available for this persona
        if (!personaConfig.available.includes(emoji as never)) {
          logger.warn({ emoji, persona: currentAgentId }, 'Emoji not available for persona');
          // Fall back to signature emoji
          return {
            expressed: personaConfig.signature,
            meaning: meaning ?? 'expression',
            _sendToFrontend: {
              type: 'expression',
              emoji: personaConfig.signature,
              meaning: meaning ?? 'expression',
              timestamp: Date.now(),
            },
          };
        }

        logger.info({ emoji, meaning, persona: currentAgentId }, 'Expression triggered');

        return {
          expressed: emoji,
          meaning:
            meaning ??
            (personaConfig.descriptions as Record<string, string>)[emoji] ??
            'expression',
          // This gets sent to frontend via data channel
          _sendToFrontend: {
            type: 'expression',
            emoji,
            meaning: meaning ?? (personaConfig.descriptions as Record<string, string>)[emoji],
            timestamp: Date.now(),
          },
        };
      },
    }),

    // Convenience method: express signature emoji
    expressSignature: llm.tool({
      description: `Express your signature/default emoji - your visual "calling card".
Use this for greetings or when you want to show your personality.`,
      parameters: z.object({
        meaning: z.string().optional().describe('Optional context for the expression'),
      }),
      execute: async ({ meaning }) => {
        const personaConfig = PERSONA_EXPRESSIONS[currentAgentId];
        const emoji = personaConfig.signature;

        logger.info({ emoji, meaning, persona: currentAgentId }, 'Signature expression');

        return {
          expressed: emoji,
          meaning: meaning ?? `${currentAgentId}'s signature`,
          _sendToFrontend: {
            type: 'expression',
            emoji,
            meaning,
            timestamp: Date.now(),
          },
        };
      },
    }),
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export const expressionTools = {
  setAgent: setExpressionAgent,
  createTools: createExpressionTool,
  PERSONA_EXPRESSIONS,
};
