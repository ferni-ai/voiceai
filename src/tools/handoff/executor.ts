/**
 * Handoff Executor - Generic Handoff Execution Logic
 *
 * This module provides the actual handoff execution logic that is
 * independent of specific agents. It replaces the hardcoded
 * handoff functions in handoff.ts.
 *
 * USAGE:
 *   import { executeHandoff } from './executor.js';
 *   await executeHandoff('peter-john', 'User wants stock research', { userId: '123' });
 */

import {
  getLockedMemberTeaser,
  isCoreTeamMember,
  isTeamMemberUnlocked,
} from '../../intelligence/context-builders/team-availability.js';
import {
  detectUserMoodFromContext,
  getAliveEntranceForHandoff,
} from '../../personas/alive-entrances.js';
import { isCoach } from '../../personas/persona-ids.js';
import { AgentRegistry } from '../../personas/registry/unified-registry.js';
import {
  getCanonicalPersonaId,
  getPersonaDisplayName,
  getVoiceId,
} from '../../personas/voice-registry.js';
import type { AgentId } from '../../services/agent-bus.js';
import { isFullTeamUnlocked } from '../../services/team-unlocks.js';
// FIX BUG #1: Import trust context builder for handoffs
import { getLogger } from '../../utils/safe-logger.js';
import {
  buildCognitiveHandoffContext,
  formatCognitiveHandoffForPrompt,
  type CognitiveHandoffContext,
} from './cognitive-handoff.js';
import { createHandoffEvent } from './types.js';
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';
// FIX BUG: Import state management from state.ts to keep state in sync
// FIX BUG: Import handoffEvents from state.ts instead of creating a duplicate!
// The handler in voice-agent.ts registers on state.ts's EventEmitter,
// so we must emit on the SAME instance.
import {
  getCurrentAgent,
  handoffEvents,
  isHandoffAllowed,
  isSameAgent, // Use the shared EventEmitter from state.ts
  recordHandoff as recordHandoffToState,
  resetHandoffState as resetStateHandoffState,
  setCurrentAgent,
} from './state.js';
// FIX BUG #12: Import HandoffRecord from types.ts instead of duplicating
import type { HandoffRecord } from './types.js';

// ============================================================================
// HANDOFF STATE
// ============================================================================

// NOTE: currentAgent state is now managed by state.ts to prevent state desync
// See FIX BUG comment above - executor.ts was maintaining its own state
// which caused getAgentContext() to return wrong identity after handoffs

// FIX BUG #2: Remove duplicate lastHandoffTimestamp - use shared state from state.ts
// The isHandoffAllowed() function from state.ts handles rate limiting with HANDOFF_TIMING.DEBOUNCE_MS

// NOTE: handoffEvents is now imported from state.ts to ensure a single shared instance
// Previously, this module had its own EventEmitter which caused events to be emitted
// on a different instance than where handlers were registered.

// FIX BUG #2: Delegate to state.ts for handoff recording to maintain single source of truth
// The recordHandoffToState function handles history tracking and rate limiting updates

// ============================================================================
// HANDOFF CONTEXT
// ============================================================================

interface HandoffContext {
  topics: string[];
  emotionalState: string;
  summary: string;
  pendingItems: string[];
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Cognitive insights for the target persona */
  cognitiveContext?: CognitiveHandoffContext;
  /** Voice emotion for better-than-human entrance adaptation */
  voiceEmotion?: {
    voiceEmotion?: string;
    voiceConfidence?: number;
    arousal?: number;
    valence?: number;
    hasVoiceStrain?: boolean;
    hasVoiceTremor?: boolean;
  };
}

let conversationContext: HandoffContext | null = null;

/**
 * Capture context before a handoff
 */
export function captureHandoffContext(context: Partial<HandoffContext>): void {
  conversationContext = {
    topics: context.topics || [],
    emotionalState: context.emotionalState || 'neutral',
    summary: context.summary || '',
    pendingItems: context.pendingItems || [],
    recentMessages: context.recentMessages || [],
    voiceEmotion: context.voiceEmotion,
    cognitiveContext: context.cognitiveContext,
  };
}

/**
 * Capture handoff context with cognitive intelligence
 */
export function captureHandoffContextWithCognition(
  context: Partial<HandoffContext>,
  sessionId: string,
  previousPersonaId: string,
  targetPersonaId: string
): void {
  // Calculate emotional weight from emotional state
  const emotionalWeight =
    context.emotionalState === 'distressed'
      ? 0.9
      : context.emotionalState === 'anxious'
        ? 0.7
        : context.emotionalState === 'sad'
          ? 0.6
          : context.emotionalState === 'excited'
            ? 0.4
            : context.emotionalState === 'happy'
              ? 0.3
              : 0.2;

  // Build cognitive handoff context
  const cognitiveContext = buildCognitiveHandoffContext(
    {
      previousPersonaId,
      targetPersonaId,
      conversationHistory: (context.recentMessages || []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      currentTopic: context.topics?.[0] || 'general',
      emotionalWeight,
      userExpertise: 'unknown', // Would come from analysis
    },
    sessionId
  );

  captureHandoffContext({
    ...context,
    cognitiveContext,
  });

  getLogger().info(
    {
      previousPersona: previousPersonaId,
      targetPersona: targetPersonaId,
      userStyle: cognitiveContext.userCognitiveStyle,
      effectiveApproaches: cognitiveContext.effectiveApproaches,
    },
    '🧠 Cognitive handoff context captured'
  );
}

/**
 * Get the captured handoff context
 */
export function getHandoffContext(): HandoffContext | null {
  return conversationContext;
}

// ============================================================================
// AGENT STATE - Re-exported from state.ts for consistency
// ============================================================================

// Re-export state functions - they're imported above and exported here for backwards compatibility
export { getCurrentAgent, isHandoffAllowed, isSameAgent, setCurrentAgent };

/**
 * Reset handoff state
 * Resets both executor and state.js state (including rate limiting)
 */
export function resetHandoffState(): void {
  // FIX BUG #2: Delegate all state to state.ts for single source of truth
  // state.ts handles: rate limiting, current agent, met personas, handoff history
  resetStateHandoffState();
  // Reset executor-specific state (conversation context only)
  conversationContext = null;
  getLogger().info('Handoff state reset');
}

// ============================================================================
// HANDOFF EXECUTION OPTIONS
// ============================================================================

export interface ExecuteHandoffOptions {
  /** User ID for context */
  userId?: string;
  /** Session ID for context */
  sessionId?: string;
  /** Sound to play during handoff */
  playSound?: string;
  /** Additional context to pass */
  context?: Record<string, unknown>;
  /** Skip rate limiting check */
  skipRateLimit?: boolean;
  /** User profile for unlock validation */
  userProfile?: import('../../types/user-profile.js').UserProfile | null;
  /** User's subscription tier */
  subscriptionTier?: 'free' | 'friend' | 'partner';
  /** Skip unlock validation (for testing) */
  skipUnlockCheck?: boolean;
  /**
   * FIX BUG #6: Recent conversation messages to pass to the new persona.
   * This ensures the new agent has context of what was just discussed.
   */
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Current emotional state of the user */
  emotionalState?: string;
  /** Topics discussed in the conversation */
  topics?: string[];
  /** Voice emotion for better-than-human entrance adaptation */
  voiceEmotion?: {
    voiceEmotion?: string;
    voiceConfidence?: number;
    arousal?: number;
    valence?: number;
    hasVoiceStrain?: boolean;
    hasVoiceTremor?: boolean;
  };
}

export interface HandoffResult {
  success: boolean;
  error?: string;
  targetAgent: string;
  targetAgentName: string;
  previousAgent: string;
  greeting: string;
  contextContinuation?: string;
  instructions?: string;
  voiceId?: string;
  rateLimited?: boolean;
  /** FIX: Indicates greeting was actually spoken by handler */
  greetingSpoken?: boolean;
  /** FIX: Indicates LLM instructions were updated by handler */
  instructionsUpdated?: boolean;
}

// ============================================================================
// MAIN HANDOFF EXECUTION
// ============================================================================

/**
 * Execute a handoff to another agent.
 *
 * This is the main entry point for all handoffs. It:
 * 1. Validates the handoff is allowed
 * 2. Gets agent information from registry
 * 3. Generates an appropriate greeting
 * 4. Emits the voiceSwitch event
 * 5. Returns the handoff result
 *
 * @param targetAgentId - The agent to hand off to
 * @param reason - The reason for the handoff
 * @param options - Additional options
 * @returns HandoffResult with success status and details
 */
export async function executeHandoff(
  targetAgentId: string,
  reason: string,
  options: ExecuteHandoffOptions = {}
): Promise<HandoffResult> {
  const previousAgent = getCurrentAgent();

  // Normalize the target agent ID
  const canonicalTargetId = getCanonicalPersonaId(targetAgentId);

  // Check if already with this agent
  if (isSameAgent(previousAgent, canonicalTargetId)) {
    getLogger().warn({ reason, targetAgent: canonicalTargetId }, 'Already with target agent');
    return {
      success: false,
      error: `Already with ${getPersonaDisplayName(canonicalTargetId)}`,
      targetAgent: canonicalTargetId,
      targetAgentName: getPersonaDisplayName(canonicalTargetId),
      previousAgent,
      greeting: '',
    };
  }

  // Rate limit check
  if (!options.skipRateLimit && !isHandoffAllowed()) {
    return {
      success: false,
      error: 'Handoff rate limited - please wait a moment',
      targetAgent: canonicalTargetId,
      targetAgentName: getPersonaDisplayName(canonicalTargetId),
      previousAgent,
      greeting: '',
      rateLimited: true,
    };
  }

  // Team unlock validation - check if this persona is available for the user
  // Skip check for coach (coordinator is always available) or if explicitly skipped
  // Bypass logic (BYPASS_TEAM_UNLOCKS env var) is handled inside isTeamMemberUnlocked()
  if (!options.skipUnlockCheck && !isCoach(canonicalTargetId)) {
    const tier = options.subscriptionTier || 'free';
    const targetName = getPersonaDisplayName(canonicalTargetId);

    // Check if this is a core team member or a marketplace agent
    if (isCoreTeamMember(canonicalTargetId)) {
      // Core team member - check individual unlock status
      const isUnlocked = isTeamMemberUnlocked(canonicalTargetId, options.userProfile || null, tier);

      if (!isUnlocked) {
        const teaser = getLockedMemberTeaser(canonicalTargetId);

        getLogger().info(
          { targetAgent: canonicalTargetId, tier, hasProfile: !!options.userProfile },
          `🔒 Handoff blocked - ${targetName} is not yet unlocked for this user`
        );

        return {
          success: false,
          error:
            teaser ||
            `${targetName} isn't available yet. Keep talking to Ferni to unlock more team members!`,
          targetAgent: canonicalTargetId,
          targetAgentName: targetName,
          previousAgent,
          greeting: '',
        };
      }
    } else {
      // Marketplace agent - requires full team to be unlocked first
      const fullTeamUnlocked = isFullTeamUnlocked(options.userProfile || null, tier);

      if (!fullTeamUnlocked) {
        getLogger().info(
          { targetAgent: canonicalTargetId, tier, hasProfile: !!options.userProfile },
          `🔒 Handoff blocked - marketplace agent ${targetName} requires full team to be unlocked`
        );

        return {
          success: false,
          error: `${targetName} is a marketplace advisor. Get to know your core team first - once everyone's unlocked, you can expand your circle!`,
          targetAgent: canonicalTargetId,
          targetAgentName: targetName,
          previousAgent,
          greeting: '',
        };
      }
    }
  }

  // Get agent info from registry
  let agent;
  try {
    agent = await AgentRegistry.getAgentOrNull(canonicalTargetId);
  } catch (err) {
    // FIX BUG #11: Proper error type narrowing
    getLogger().warn({ targetAgentId, error: String(err) }, 'Failed to get agent from registry');
  }

  // Get display name
  const targetAgentName = agent?.name || getPersonaDisplayName(canonicalTargetId);

  // FIX BUG #2: Record the handoff via state.ts (updates rate limiting timestamp too)
  recordHandoffToState(previousAgent, canonicalTargetId as AgentId, reason);

  // FIX BUG #6: Capture conversation context if provided
  // This ensures the new persona has awareness of what was just discussed
  if (options.recentMessages || options.topics || options.emotionalState || options.voiceEmotion) {
    captureHandoffContext({
      topics: options.topics || [],
      emotionalState: options.emotionalState || 'neutral',
      summary: reason,
      pendingItems: [],
      recentMessages: options.recentMessages || [],
      voiceEmotion: options.voiceEmotion,
    });
    getLogger().debug(
      {
        messageCount: options.recentMessages?.length || 0,
        topics: options.topics,
        emotionalState: options.emotionalState,
      },
      '📝 Captured conversation context for handoff'
    );
  }

  // Update current agent
  setCurrentAgent(canonicalTargetId as AgentId);

  // Generate greeting
  const greeting = await generateHandoffGreeting(canonicalTargetId, reason, previousAgent);

  // Build context continuation - now includes recent messages if available
  const contextContinuation = buildContextContinuation(reason, options.recentMessages);

  // Get voice ID for the target agent
  let voiceId: string | undefined;
  try {
    voiceId = getVoiceId(canonicalTargetId);
  } catch (err) {
    // FIX BUG #11: Proper error type narrowing
    getLogger().warn({ targetAgentId, error: String(err) }, 'Could not get voice ID');
  }

  // Build instructions for the new agent
  const instructions = buildHandoffInstructions(canonicalTargetId, reason, contextContinuation);

  getLogger().info(
    { from: previousAgent, to: canonicalTargetId, reason },
    `🔄 HANDOFF: ${previousAgent} → ${targetAgentName}`
  );

  // Emit voiceSwitch event
  // FIX BUG: Add logging to trace event emission
  const eventData = await createHandoffEvent(canonicalTargetId, {
    greeting,
    playSound: options.playSound,
    previousAgentId: previousAgent,
  });

  getLogger().info(
    {
      targetId: canonicalTargetId,
      hasPersona: !!eventData.persona,
      personaId: eventData.persona?.id,
      previousAgentId: eventData.previousAgentId,
      listenerCount: handoffEvents.listenerCount('voiceSwitch'),
    },
    '📡 Emitting voiceSwitch event'
  );

  // FIX: Wait for handler to complete before returning to LLM
  // This prevents race conditions where LLM responds before greeting is spoken
  // FIX BUG #2 & #8: Use shared HANDOFF_TIMING constant

  const handlerCompletePromise = new Promise<{
    success: boolean;
    greetingSpoken: boolean;
    instructionsUpdated: boolean;
    error?: string;
  }>((resolve) => {
    // FIX BUG #8: Track listener so we can always clean it up
    let listenerRemoved = false;

    const onComplete = (completionData: {
      targetId: string;
      success: boolean;
      greetingSpoken: boolean;
      instructionsUpdated: boolean;
      error?: string;
    }) => {
      if (completionData.targetId === canonicalTargetId) {
        clearTimeout(timeoutId);
        if (!listenerRemoved) {
          handoffEvents.off('handoffHandlerComplete', onComplete);
          listenerRemoved = true;
        }
        resolve(completionData);
      }
    };

    // Set up timeout - FIX BUG #8: Remove listener on timeout to prevent leak
    // 🐛 FIX BUG #5: Timeout should NOT return success:true - that's misleading!
    // The handoff may have completed but we lost the event, OR it actually failed.
    // Return a distinct status so callers know this was a timeout.
    const timeoutId = setTimeout(() => {
      getLogger().warn(
        { targetId: canonicalTargetId },
        '⚠️ Handoff handler timeout - proceeding without confirmation'
      );
      if (!listenerRemoved) {
        handoffEvents.off('handoffHandlerComplete', onComplete);
        listenerRemoved = true;
      }
      // Return success: false with a timeout flag so caller knows what happened
      resolve({
        success: false,
        greetingSpoken: false,
        instructionsUpdated: false,
        error: 'timeout',
      });
    }, HANDOFF_TIMING.HANDOFF_TIMEOUT_MS);

    handoffEvents.on('handoffHandlerComplete', onComplete);
  });

  // Emit the event to trigger the handler
  handoffEvents.emit('voiceSwitch', eventData);

  getLogger().info(
    { targetId: canonicalTargetId },
    '✅ voiceSwitch event emitted, waiting for handler...'
  );

  // Wait for handler to complete
  const handlerResult = await handlerCompletePromise;

  // 🐛 FIX: Properly log and handle handler failures/timeouts
  if (handlerResult.success) {
    getLogger().info(
      {
        targetId: canonicalTargetId,
        greetingSpoken: handlerResult.greetingSpoken,
        instructionsUpdated: handlerResult.instructionsUpdated,
      },
      '✅ Handoff handler completed successfully'
    );
  } else {
    getLogger().warn(
      {
        targetId: canonicalTargetId,
        error: handlerResult.error,
        greetingSpoken: handlerResult.greetingSpoken,
        instructionsUpdated: handlerResult.instructionsUpdated,
      },
      '⚠️ Handoff handler did not complete successfully'
    );
  }

  // Note: We still return success: true from the executor's perspective because:
  // 1. The handoff state WAS updated (currentAgent changed)
  // 2. The voiceSwitch event WAS emitted
  // The handler result indicates whether greeting/instructions were applied
  return {
    success: true,
    targetAgent: canonicalTargetId,
    targetAgentName,
    previousAgent,
    greeting,
    contextContinuation,
    instructions,
    voiceId,
    // FIX: Include handler result so LLM knows greeting was spoken
    greetingSpoken: handlerResult.greetingSpoken,
    instructionsUpdated: handlerResult.instructionsUpdated,
  };
}

// ============================================================================
// GREETING GENERATION
// ============================================================================

/**
 * Generate a context-aware greeting for the target agent
 */
async function generateHandoffGreeting(
  targetAgentId: string,
  reason: string,
  previousAgent: string
): Promise<string> {
  const targetName = getPersonaDisplayName(targetAgentId);

  // Try to get an ALIVE entrance (context-aware)
  try {
    const aliveEntrance = await getAliveEntranceForHandoff(targetAgentId, {
      referringAgent: previousAgent,
      precedingTopic: reason,
      userMood: detectUserMoodFromContext(reason),
      // Pass voice emotion for better-than-human entrance adaptation
      voiceEmotion: conversationContext?.voiceEmotion,
    });

    if (aliveEntrance) {
      // Enhance with cognitive collaboration if context available
      const cognitiveEnhancement = getCognitiveCollaborationGreeting(targetAgentId, previousAgent);

      if (cognitiveEnhancement) {
        return `${aliveEntrance} ${cognitiveEnhancement}`;
      }

      return aliveEntrance;
    }
  } catch (err) {
    // FIX BUG #11: Proper error type narrowing
    getLogger().warn({ error: String(err) }, 'Could not get ALIVE entrance');
  }

  // Fall back to a generic greeting with cognitive enhancement
  const cognitiveEnhancement = getCognitiveCollaborationGreeting(targetAgentId, previousAgent);

  const baseGreeting = `Hi there! ${targetName} here. ${getReasonAcknowledgment(reason)}`;

  if (cognitiveEnhancement) {
    return `${baseGreeting} ${cognitiveEnhancement}`;
  }

  return baseGreeting;
}

/**
 * Generate cognitive collaboration greeting enhancement
 */
function getCognitiveCollaborationGreeting(
  targetAgentId: string,
  previousAgentId: string
): string | null {
  // Only generate if we have cognitive context from handoff
  if (!conversationContext?.cognitiveContext) {
    return null;
  }

  const { userCognitiveStyle, effectiveApproaches, previousPersonaStyle } =
    conversationContext.cognitiveContext;

  // Cognitive collaboration greetings by persona
  const collaborationPhrases: Record<string, Record<string, string>> = {
    'peter-john': {
      narrative:
        "Ferni mentioned you like the story behind things - I'll make sure to frame the data that way.",
      empathetic:
        "Maya told me you're processing some feelings here - I'll keep that in mind with the numbers.",
      pragmatic:
        "Jordan said you're ready for action - let me show you the data that matters most.",
    },
    'maya-santos': {
      analytical:
        "Peter shared his analysis - but I want to check in on how you're feeling about all that.",
      narrative:
        "Ferni set the stage beautifully - let's explore what this means for you personally.",
      systematic: "Alex organized things well - now let's see what feels right for you.",
    },
    ferni: {
      analytical: "Peter's given me the data picture - let me help you find the meaning in it.",
      empathetic: "Maya's been holding space with you - let's see where the story goes from here.",
      pragmatic: "Jordan's got the action plan - I'm curious about the deeper why behind it all.",
    },
    'alex-chen': {
      narrative: "Ferni's been exploring the big picture - let me help organize the next steps.",
      empathetic: "Maya mentioned what you're working through - I'll make the process gentle.",
      analytical: "Peter's got the data - now let me help you actually do something with it.",
    },
    'jordan-taylor': {
      analytical: "Peter showed me the patterns - let's turn those into a real plan!",
      empathetic: "Maya helped you process - now let's channel that into something exciting!",
      narrative: "Ferni painted the vision - let's make it happen!",
    },
    'nayan-patel': {
      analytical: "Peter's numbers tell one story - let's find the wisdom underneath.",
      pragmatic: "Jordan's got the doing - I'm here for the being.",
      empathetic: "Maya's been with your heart - let me offer a different kind of space.",
    },
  };

  // Get collaboration phrase based on target persona and previous persona style
  const targetPhrases = collaborationPhrases[targetAgentId];
  if (!targetPhrases) return null;

  const phrase = targetPhrases[previousPersonaStyle];
  if (!phrase) return null;

  // Only use 30% of the time to avoid being overwhelming
  if (Math.random() > 0.3) return null;

  return phrase;
}

/**
 * Generate a reason acknowledgment phrase
 */
function getReasonAcknowledgment(reason: string): string {
  const reasonLower = reason.toLowerCase();

  if (reasonLower.includes('stock') || reasonLower.includes('invest')) {
    return "I hear we're talking investments!";
  }
  if (
    reasonLower.includes('budget') ||
    reasonLower.includes('save') ||
    reasonLower.includes('spend')
  ) {
    return "Let's talk about your finances!";
  }
  if (
    reasonLower.includes('calendar') ||
    reasonLower.includes('schedule') ||
    reasonLower.includes('email')
  ) {
    return 'I can help with that scheduling!';
  }
  if (
    reasonLower.includes('goal') ||
    reasonLower.includes('plan') ||
    reasonLower.includes('milestone')
  ) {
    return "Let's work on your plans!";
  }

  return "What's on your mind?";
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context continuation string from reason and recent messages
 * FIX BUG #6: Now accepts recent messages to pass to the new persona
 */
function buildContextContinuation(
  reason: string,
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  const parts: string[] = [];

  // Extract key topics from the reason
  if (reason && reason.length >= 10) {
    const topics: string[] = [];

    if (reason.toLowerCase().includes('stock')) topics.push('stocks');
    if (reason.toLowerCase().includes('invest')) topics.push('investing');
    if (reason.toLowerCase().includes('budget')) topics.push('budgeting');
    if (reason.toLowerCase().includes('save')) topics.push('savings');
    if (reason.toLowerCase().includes('calendar')) topics.push('calendar');
    if (reason.toLowerCase().includes('goal')) topics.push('goals');
    if (reason.toLowerCase().includes('plan')) topics.push('planning');

    if (topics.length > 0) {
      parts.push(`The user was discussing: ${topics.join(', ')}.`);
    }
    parts.push(`Handoff reason: ${reason}`);
  }

  // FIX BUG #6: Include recent conversation for context continuity
  if (recentMessages && recentMessages.length > 0) {
    // Get last 3 messages to give new persona context without overwhelming
    const lastMessages = recentMessages.slice(-3);
    const conversationSummary = lastMessages
      .map(
        (m) =>
          `${m.role === 'user' ? 'User' : 'Previous Agent'}: ${m.content.slice(0, 150)}${m.content.length > 150 ? '...' : ''}`
      )
      .join('\n');

    parts.push(`\n[RECENT CONVERSATION]\n${conversationSummary}`);
  }

  return parts.join(' ');
}

/**
 * Build instructions for the new agent
 */
function buildHandoffInstructions(
  targetAgentId: string,
  reason: string,
  contextContinuation: string
): string {
  const targetName = getPersonaDisplayName(targetAgentId);

  // Include cognitive context if available
  let cognitiveInstructions = '';
  if (conversationContext?.cognitiveContext) {
    cognitiveInstructions = `\n\n${formatCognitiveHandoffForPrompt(conversationContext.cognitiveContext)}`;
  }

  return `You are now ${targetName}. A handoff just occurred.

HANDOFF REASON: ${reason}

${contextContinuation ? `CONTEXT: ${contextContinuation}` : ''}
${cognitiveInstructions}

IMPORTANT: Your greeting has ALREADY been spoken automatically. Do NOT repeat a greeting or introduction - the user already heard "${targetName} here" or similar. Jump straight into addressing their needs.

INSTRUCTIONS:
1. Do NOT speak a greeting - it was already said. Start with substance.
2. Reference the context if relevant
3. Move forward with your expertise in this area
4. Stay in character as ${targetName}
5. Apply the cognitive insights above to match the user's thinking style`;
}

// ============================================================================
// UTILITY EXPORTS - FIX BUG #2: Delegate to state.ts for single source of truth
// ============================================================================

// Re-export history functions from state.ts
export { getHandoffHistory, getLastHandoff, clearHandoffHistory } from './state.js';

// ============================================================================
// EXPORTS
// ============================================================================

export default executeHandoff;
