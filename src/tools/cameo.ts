/**
 * Cameo Tool - Allows Ferni to invite team members to briefly "pop in"
 *
 * @deprecated This file is DEPRECATED. Use the domain-based cameo tools instead:
 *   - src/tools/domains/cameo/index.ts
 *
 * The new domain-based tools are automatically loaded via the tool registry
 * when an agent's manifest includes the 'cameo' domain.
 *
 * This legacy file uses module-level session state (setCameoSessionContext)
 * which is not compatible with the registry-based tool system.
 *
 * MIGRATION:
 * - Add 'cameo' to the agent's manifest tools.domains array
 * - The inviteCameo and checkCameoOpportunity tools will be auto-available
 * - No need to call setCameoSessionContext - context is passed via ToolContext
 *
 * This file is kept for backwards compatibility but should not be used for new code.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  executeCameo,
  getCooldownStatus,
  isInCameo,
  type CameoPersonaId,
  type CameoTriggerType,
} from '../services/cameo/index.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// CAMEO PERSONAS - Who can do cameos
// ============================================================================

export const CAMEO_PERSONAS = {
  'peter-john': {
    name: 'Peter',
    domains: ['stocks', 'investing', 'research', 'data analysis', 'market patterns'],
    personality: 'analytical, data-driven, thorough',
  },
  'alex-chen': {
    name: 'Alex',
    domains: ['scheduling', 'calendar', 'communications', 'reminders', 'deadlines'],
    personality: 'organized, helpful, detail-oriented',
  },
  'maya-santos': {
    name: 'Maya',
    domains: ['habits', 'routines', 'budgeting', 'daily practices', 'consistency'],
    personality: 'gentle, encouraging, patient',
  },
  'jordan-taylor': {
    name: 'Jordan',
    domains: ['planning', 'milestones', 'celebrations', 'goals', 'dreams'],
    personality: 'enthusiastic, optimistic, excited',
  },
  'nayan-patel': {
    name: 'Nayan',
    domains: ['wisdom', 'perspective', 'patience', 'philosophy', 'long-term thinking'],
    personality: 'wise, calm, thoughtful',
  },
} as const;

type CameoPersonaKey = keyof typeof CAMEO_PERSONAS;

// ============================================================================
// SESSION STATE
// ============================================================================

let currentSessionId: string | null = null;
let currentUserId: string | null = null;

/**
 * Set session context for cameo tool.
 */
export function setCameoSessionContext(sessionId: string, userId?: string): void {
  currentSessionId = sessionId;
  currentUserId = userId || null;
  log.info({ sessionId, userId }, 'Cameo session context set');
}

/**
 * Clear session context.
 */
export function clearCameoSessionContext(): void {
  currentSessionId = null;
  currentUserId = null;
}

// ============================================================================
// CAMEO TOOLS
// ============================================================================

/**
 * Create cameo tools for Ferni to use.
 */
export function createCameoTools() {
  return {
    /**
     * Invite a team member for a brief cameo.
     */
    inviteCameo: llm.tool({
      description: `Invite a team member to briefly "pop in" and share a quick insight.
      
Use this when:
- User mentions a topic in someone's domain (Peter for data, Alex for scheduling, etc.)
- A quick perspective or data point would add value
- You want to celebrate something (Jordan would love this!)
- The user could benefit from wisdom (Nayan's specialty)

HOW IT WORKS:
1. You introduce the cameo naturally ("Let me have Peter share something...")
2. Call this tool with the personaId
3. That team member will pop in with a brief insight
4. They automatically hand back to you

IMPORTANT:
- Use sparingly - cameos are special moments
- Don't interrupt deep conversations
- Let the team member know what topic to address via the context parameter

Team members available:
- peter-john: Research, data, market analysis
- alex-chen: Scheduling, calendar, communications
- maya-santos: Habits, routines, budgeting
- jordan-taylor: Planning, milestones, celebrations
- nayan-patel: Wisdom, perspective, patience`,
      parameters: z.object({
        personaId: z
          .enum(['peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'])
          .describe('The team member to invite for a cameo'),
        context: z.string().describe('Brief context about what topic/insight to address'),
        triggerType: z
          .enum([
            'data_insight',
            'scheduling',
            'habit_check',
            'planning',
            'wisdom',
            'celebration',
            'support',
            'expertise',
            'manual',
          ])
          .optional()
          .describe('Type of cameo (auto-detected if not specified)'),
        priority: z
          .enum(['normal', 'high', 'celebration'])
          .optional()
          .describe('Priority level (affects cooldown)'),
      }),
      execute: async ({ personaId, context, triggerType, priority }) => {
        if (!currentSessionId) {
          log.warn('No session context set for cameo');
          return {
            success: false,
            error: 'Session not initialized',
            suggestion: 'Try again in a moment',
          };
        }

        // Check if already in a cameo
        if (isInCameo(currentSessionId)) {
          return {
            success: false,
            error: 'A cameo is already in progress',
            suggestion: 'Wait for the current cameo to finish',
          };
        }

        // Check cooldown
        const cooldown = getCooldownStatus(currentSessionId, priority || 'normal');
        if (cooldown.isOnCooldown) {
          const secondsRemaining = Math.ceil(cooldown.remainingMs / 1000);
          return {
            success: false,
            error: `Cameo cooldown active (${secondsRemaining}s remaining)`,
            suggestion: 'Try again in a moment, or continue the conversation yourself',
          };
        }

        const persona = CAMEO_PERSONAS[personaId as CameoPersonaKey];
        if (!persona) {
          return {
            success: false,
            error: `Unknown persona: ${personaId}`,
            suggestion:
              'Use one of: peter-john, alex-chen, maya-santos, jordan-taylor, nayan-patel',
          };
        }

        log.info(
          {
            personaId,
            context,
            triggerType,
            sessionId: currentSessionId,
          },
          `Cameo requested for ${persona.name}`
        );

        // Determine trigger type if not specified
        const resolvedTriggerType: CameoTriggerType =
          triggerType || detectTriggerType(personaId as CameoPersonaKey);

        // Execute the cameo
        const result = await executeCameo(
          {
            personaId: personaId as CameoPersonaId,
            insight: context,
            triggerType: resolvedTriggerType,
            priority: priority || 'normal',
          },
          {
            sessionId: currentSessionId,
            userId: currentUserId || undefined,
          }
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error,
            blockedByCooldown: result.blockedByCooldown,
            cooldownRemaining: result.cooldownRemaining,
            suggestion: result.blockedByCooldown
              ? 'Try again after the cooldown'
              : 'Try a different approach',
          };
        }

        return {
          success: true,
          personaId,
          personaName: persona.name,
          greeting: result.greeting,
          insight: result.insight,
          handback: result.handback,
          message: `${persona.name} is popping in to share an insight about: ${context}`,
          _sendToFrontend: {
            type: 'cameo_invoked',
            personaId,
            personaName: persona.name,
            timestamp: Date.now(),
          },
        };
      },
    }),

    /**
     * Check if a cameo would be valuable right now.
     */
    checkCameoOpportunity: llm.tool({
      description: `Check if bringing in a team member would add value to the current conversation.
      
Use this when you're unsure if a cameo would be appropriate. Returns a suggestion.`,
      parameters: z.object({
        topic: z.string().describe('The current topic being discussed'),
        userState: z.string().optional().describe("User's emotional state (if known)"),
      }),
      execute: async ({ topic, userState }) => {
        if (!currentSessionId) {
          return {
            shouldCameo: false,
            reason: 'Session not initialized',
          };
        }

        // Don't suggest cameos if user is distressed
        if (
          userState &&
          ['stressed', 'upset', 'anxious', 'crying'].includes(userState.toLowerCase())
        ) {
          return {
            shouldCameo: false,
            reason: 'User may benefit from staying with you right now',
            alternative: 'Continue providing emotional support yourself',
          };
        }

        // Check cooldown
        const cooldown = getCooldownStatus(currentSessionId);
        if (cooldown.isOnCooldown) {
          return {
            shouldCameo: false,
            reason: `Cooldown active (${Math.ceil(cooldown.remainingMs / 1000)}s remaining)`,
          };
        }

        // Find best persona for topic
        const topicLower = topic.toLowerCase();
        let bestPersona: CameoPersonaKey | null = null;
        let bestScore = 0;

        for (const [id, persona] of Object.entries(CAMEO_PERSONAS)) {
          let score = 0;
          for (const domain of persona.domains) {
            if (topicLower.includes(domain.toLowerCase())) {
              score += 2;
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestPersona = id as CameoPersonaKey;
          }
        }

        if (bestPersona && bestScore >= 2) {
          const persona = CAMEO_PERSONAS[bestPersona];
          return {
            shouldCameo: true,
            suggestedPersona: bestPersona,
            personaName: persona.name,
            reason: `Topic "${topic}" aligns with ${persona.name}'s expertise in ${persona.domains.join(', ')}`,
            examplePhrase: `You know, ${persona.name} might have a thought on this...`,
          };
        }

        return {
          shouldCameo: false,
          reason: 'No strong match for current topic',
          alternative: 'Continue the conversation yourself',
        };
      },
    }),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect the trigger type based on persona.
 */
function detectTriggerType(personaId: CameoPersonaKey): CameoTriggerType {
  switch (personaId) {
    case 'peter-john':
      return 'data_insight';
    case 'alex-chen':
      return 'scheduling';
    case 'maya-santos':
      return 'habit_check';
    case 'jordan-taylor':
      return 'planning';
    case 'nayan-patel':
      return 'wisdom';
    default:
      return 'manual';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const cameoTools = {
  setCameoSessionContext,
  clearCameoSessionContext,
  createTools: createCameoTools,
  CAMEO_PERSONAS,
};

export default cameoTools;
