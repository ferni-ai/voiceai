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
import { endCameo, executeCameo, getCooldownStatus, getCurrentCameoPersona, isInCameo, } from '../../../services/cameo/index.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
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
};
/**
 * Detect the trigger type based on persona.
 */
function detectTriggerType(personaId) {
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
const inviteCameoDef = {
    id: 'inviteCameo',
    name: 'Invite Team Cameo',
    description: 'Invite a team member to briefly pop in and share a quick insight',
    domain: 'cameo',
    tags: ['cameo', 'team', 'collaboration', 'pop-in'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('inviteCameo'),
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
                const userData = toolCtx?.userData;
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
                // NOTE: Previously we blocked cameos for unlocked team members, suggesting handoff instead.
                // This was a design choice treating cameos as "preview" for locked members only.
                // However, cameos are also valuable as a feature - quick pop-ins for insights without
                // a full handoff. So we now allow cameos regardless of unlock status.
                //
                // The distinction is:
                // - Cameo: Quick 1-2 sentence insight, then return to Ferni (no context switch)
                // - Handoff: Full conversation transfer with full context (user stays with that persona)
                //
                // Both are valid interactions, let the LLM choose appropriately.
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
                const persona = CAMEO_PERSONAS[personaId];
                if (!persona) {
                    return {
                        success: false,
                        error: `Unknown persona: ${personaId}`,
                        suggestion: 'Use one of: peter-john, alex-chen, maya-santos, jordan-taylor, nayan-patel',
                    };
                }
                log.info({
                    personaId,
                    context,
                    triggerType,
                    sessionId,
                }, `Cameo requested for ${persona.name}`);
                // Determine trigger type if not specified
                const resolvedTriggerType = triggerType || detectTriggerType(personaId);
                // Execute the cameo
                const result = await executeCameo({
                    personaId: personaId,
                    insight: context,
                    triggerType: resolvedTriggerType,
                    priority: priority || 'normal',
                }, {
                    sessionId,
                    userId: sessionId,
                });
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
                log.info({
                    personaId,
                    personaName: persona.name,
                    greetingSpoken: result.greetingSpoken,
                    instructionsUpdated: result.instructionsUpdated,
                }, '🎬 Cameo execution SUCCESS - handler completed');
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
                    nextStep: 'After speaking the handback, you MUST call the completeCameo tool to return to Ferni.',
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
const completeCameoDef = {
    id: 'completeCameo',
    name: 'Complete Cameo',
    description: 'Signal that you are done with your cameo and ready to hand back to Ferni',
    domain: 'cameo',
    tags: ['cameo', 'team', 'handback'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('completeCameo'),
            parameters: z.object({
                finalThought: z
                    .string()
                    .optional()
                    .describe('Optional final thought before handing back (will not be spoken, just logged)'),
            }),
            execute: async ({ finalThought }, { ctx: toolCtx }) => {
                // Get session ID from runtime context
                const userData = toolCtx?.userData;
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
                log.info({ sessionId, personaId: currentCameoPersona, duration: result.duration }, '🎬 Cameo completed successfully via completeCameo tool');
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
const checkCameoOpportunityDef = {
    id: 'checkCameoOpportunity',
    name: 'Check Cameo Opportunity',
    description: 'Check if bringing in a team member would add value to the current conversation',
    domain: 'cameo',
    tags: ['cameo', 'team', 'suggestion'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('checkCameoOpportunity'),
            parameters: z.object({
                topic: z.string().describe('The current topic being discussed'),
                userState: z.string().optional().describe("User's emotional state (if known)"),
            }),
            execute: async ({ topic, userState }, { ctx: toolCtx }) => {
                // Get session ID from runtime context, falling back to build-time context
                const userData = toolCtx?.userData;
                const sessionId = userData?.services?.sessionId || ctx.sessionId || ctx.userId;
                if (!sessionId) {
                    return {
                        shouldCameo: false,
                        reason: 'Session not initialized',
                    };
                }
                // Don't suggest cameos if user is distressed
                if (userState &&
                    ['stressed', 'upset', 'anxious', 'crying'].includes(userState.toLowerCase())) {
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
                let bestPersona = null;
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
                        bestPersona = id;
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
const cameoTools = [inviteCameoDef, completeCameoDef, checkCameoOpportunityDef];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('cameo', cameoTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map