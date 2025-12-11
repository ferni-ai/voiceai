/**
 * Cameo Domain Tools
 *
 * Tools for team member "pop-in" cameos during conversations.
 * Allows Ferni to bring in team members for quick insights without a full handoff.
 *
 * DOMAIN: cameo
 * TOOLS:
 *   inviteCameo - Invite a team member to pop in with a quick insight
 *   checkCameoOpportunity - Check if a cameo would add value to current conversation
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { isTeamMemberUnlocked } from '../../../intelligence/context-builders/team-availability.js';
import {
  endCameo,
  executeCameo,
  getCooldownStatus,
  getCurrentCameoPersona,
  isInCameo,
  type CameoPersonaId,
  type CameoTriggerType,
} from '../../../services/cameo/index.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';

const log = getLogger();

// ============================================================================
// CAMEO PERSONAS - Who can do cameos
// ============================================================================

const CAMEO_PERSONAS = {
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
// INVITE CAMEO TOOL
// ============================================================================

const inviteCameoDef: ToolDefinition = {
  id: 'inviteCameo',
  name: 'Invite Team Cameo',
  description: 'Invite a team member to briefly pop in and share a quick insight',
  domain: 'cameo',
  tags: ['cameo', 'team', 'collaboration', 'pop-in'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Invite a team member to briefly "pop in" and share a quick insight.

⚠️ CRITICAL: Only use cameos for team members who are NOT on the user's current roster!
   - If the team member IS on their roster → use handoffToX instead (full handoff)
   - If the team member is NOT on their roster → use this cameo tool (quick pop-in)
   
Use this when:
- User mentions a topic in someone's domain (Peter for data, Alex for scheduling, etc.)
- A quick perspective or data point would add value  
- You want to celebrate something (Jordan would love this!)
- The user could benefit from wisdom (Nayan's specialty)
- AND the team member is NOT already on the user's roster

HOW IT WORKS:
1. You introduce the cameo naturally ("Let me have Peter share something...")
2. Call this tool with the personaId
3. That team member will pop in with a brief insight (avatar appears in roster)
4. They speak their insight
5. They automatically hand back to you (avatar slides out)

IMPORTANT:
- Use sparingly - cameos are special moments
- Don't interrupt deep conversations
- Let the team member know what topic to address via the context parameter
- NEVER use for team members already on the roster - use handoff instead

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
      execute: async ({ personaId, context, triggerType, priority }, { ctx: toolCtx }) => {
        // Get session ID from runtime context, falling back to build-time context
        const userData = toolCtx?.userData as
          | {
              services?: {
                sessionId?: string;
                userProfile?: UserProfile | null;
              };
            }
          | undefined;
        const sessionId = userData?.services?.sessionId || ctx.sessionId || ctx.userId;

        if (!sessionId) {
          log.warn('No session/user context set for cameo');
          return {
            success: false,
            error: 'Session not initialized',
            suggestion: 'Try again in a moment',
          };
        }

        log.info({ sessionId, personaId, context }, '🎬 Cameo tool invoked');

        // FIX: Validate that this team member is NOT on the user's roster
        // Cameos are for team members the user hasn't unlocked yet.
        // If they're on the roster, use handoff instead.
        const userProfile = userData?.services?.userProfile || null;
        const subscriptionTier =
          (userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

        if (isTeamMemberUnlocked(personaId, userProfile, subscriptionTier)) {
          const persona = CAMEO_PERSONAS[personaId as CameoPersonaKey];
          log.warn(
            { personaId, hasProfile: !!userProfile, tier: subscriptionTier },
            '🎬 Cameo blocked - team member is already on roster'
          );
          return {
            success: false,
            error: `${persona?.name || personaId} is already on the user's team!`,
            suggestion: `Use handoffTo${persona?.name || 'X'} for a full handoff instead of a cameo.`,
            useHandoffInstead: true,
            targetPersonaId: personaId,
          };
        }

        // Check if already in a cameo
        if (isInCameo(sessionId)) {
          return {
            success: false,
            error: 'A cameo is already in progress',
            suggestion: 'Wait for the current cameo to finish',
          };
        }

        // Check cooldown
        const cooldown = getCooldownStatus(sessionId, priority || 'normal');
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
            sessionId,
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
            sessionId,
            userId: sessionId,
          }
        );

        if (!result.success) {
          log.warn({ personaId, error: result.error }, '🎬 Cameo execution failed');
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

        log.info(
          {
            personaId,
            personaName: persona.name,
            greetingSpoken: result.greetingSpoken,
            instructionsUpdated: result.instructionsUpdated,
          },
          '🎬 Cameo execution SUCCESS - handler completed'
        );

        // FIX: The orchestrator now waits for handler completion, so we use actual result values.
        // The greeting is ALREADY spoken by the handler, so we tell the LLM not to repeat it.
        return {
          success: true,
          personaId,
          personaName: persona.name,
          // IMPORTANT: Greeting has ALREADY been spoken by the voice handler
          // The LLM should NOT speak the greeting again!
          greetingAlreadySpoken: result.greetingSpoken ?? true,
          instructionsUpdated: result.instructionsUpdated ?? true,
          // The LLM (now with cameo persona instructions) should speak this insight
          insightToSpeak: result.insight || context,
          // After speaking the insight, speak this handback phrase
          handbackToSpeak: result.handback,
          // CRITICAL: After speaking the handback, the LLM MUST call completeCameo!
          nextStep:
            'After speaking the handback, you MUST call the completeCameo tool to return to Ferni.',
          message: `${persona.name} is now speaking. Speak the insight, then the handback, then call completeCameo.`,
          _sendToFrontend: {
            type: 'cameo_invoked',
            personaId,
            personaName: persona.name,
            timestamp: Date.now(),
          },
        };
      },
    });
  },
};

// ============================================================================
// COMPLETE CAMEO TOOL - FIX GAP 1: This is how the cameo properly ends!
// ============================================================================

const completeCameoDef: ToolDefinition = {
  id: 'completeCameo',
  name: 'Complete Cameo',
  description: 'Signal that you are done with your cameo and ready to hand back to Ferni',
  domain: 'cameo',
  tags: ['cameo', 'team', 'handback'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Call this tool AFTER you have spoken your insight and handback phrase.

⚠️ CRITICAL: You MUST call this tool to complete a cameo!
   - The voice will switch back to Ferni
   - Your LLM instructions will be restored to Ferni's
   - The cameo will be recorded as complete

Without calling this tool, the cameo will time out awkwardly.

Example flow:
1. inviteCameo is called → you receive insightToSpeak and handbackToSpeak
2. You speak the insight naturally
3. You speak the handback (e.g., "Back to you, Ferni!")
4. You call completeCameo → Ferni takes over`,
      parameters: z.object({
        finalThought: z
          .string()
          .optional()
          .describe('Optional final thought before handing back (will not be spoken, just logged)'),
      }),
      execute: async ({ finalThought }, { ctx: toolCtx }) => {
        // Get session ID from runtime context
        const userData = toolCtx?.userData as
          | {
              services?: { sessionId?: string };
            }
          | undefined;
        const sessionId = userData?.services?.sessionId || ctx.sessionId || ctx.userId;

        if (!sessionId) {
          log.warn('No session context for completeCameo');
          return {
            success: false,
            error: 'Session not initialized',
          };
        }

        log.info({ sessionId, finalThought }, '🎬 completeCameo called - ending cameo');

        // Check if actually in a cameo
        if (!isInCameo(sessionId)) {
          log.warn({ sessionId }, 'completeCameo called but no cameo in progress');
          return {
            success: false,
            error: 'No cameo in progress',
            suggestion: 'You are not currently in a cameo',
          };
        }

        const currentCameoPersona = getCurrentCameoPersona(sessionId);

        // FIX GAP 1: Actually call endCameo to complete the cameo!
        const result = await endCameo(sessionId);

        if (!result.success) {
          log.error({ error: result.error }, 'Failed to complete cameo');
          return {
            success: false,
            error: result.error,
          };
        }

        log.info(
          { sessionId, personaId: currentCameoPersona, duration: result.duration },
          '🎬 Cameo completed successfully via completeCameo tool'
        );

        return {
          success: true,
          message: 'Cameo complete! Ferni is back.',
          previousSpeaker: currentCameoPersona,
          duration: result.duration,
          // This is returned to Ferni who can continue the conversation
          _instruction: 'You are now Ferni again. Continue the conversation naturally.',
        };
      },
    });
  },
};

// ============================================================================
// CHECK CAMEO OPPORTUNITY TOOL
// ============================================================================

const checkCameoOpportunityDef: ToolDefinition = {
  id: 'checkCameoOpportunity',
  name: 'Check Cameo Opportunity',
  description: 'Check if bringing in a team member would add value to the current conversation',
  domain: 'cameo',
  tags: ['cameo', 'team', 'suggestion'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Check if bringing in a team member would add value to the current conversation.
      
Use this when you're unsure if a cameo would be appropriate. Returns a suggestion.`,
      parameters: z.object({
        topic: z.string().describe('The current topic being discussed'),
        userState: z.string().optional().describe("User's emotional state (if known)"),
      }),
      execute: async ({ topic, userState }, { ctx: toolCtx }) => {
        // Get session ID from runtime context, falling back to build-time context
        const userData = toolCtx?.userData as
          | {
              services?: { sessionId?: string };
            }
          | undefined;
        const sessionId = userData?.services?.sessionId || ctx.sessionId || ctx.userId;

        if (!sessionId) {
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
        const cooldown = getCooldownStatus(sessionId);
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
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const cameoTools: ToolDefinition[] = [inviteCameoDef, completeCameoDef, checkCameoOpportunityDef];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('cameo', cameoTools);

export default getToolDefinitions;
