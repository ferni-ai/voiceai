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
import { AgentRegistry } from '../../personas/registry/unified-registry.js';
import {
  getCanonicalPersonaId,
  getPersonaDisplayName,
  getVoiceId,
} from '../../personas/voice-registry.js';
import type { AgentId } from '../../services/agent-bus.js';
import { isFullTeamUnlocked } from '../../services/team-unlocks.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  buildCognitiveHandoffContext,
  formatCognitiveHandoffForPrompt,
  type CognitiveHandoffContext,
} from './cognitive-handoff.js';
import { createHandoffEvent } from './types.js';
// FIX BUG: Import state management from state.ts to keep state in sync
// FIX BUG: Import handoffEvents from state.ts instead of creating a duplicate!
// The handler in voice-agent.ts registers on state.ts's EventEmitter,
// so we must emit on the SAME instance.
import {
  getCurrentAgent,
  handoffEvents,
  isHandoffAllowed,
  isSameAgent, // Use the shared EventEmitter from state.ts
  resetHandoffState as resetStateHandoffState,
  setCurrentAgent,
} from './state.js';

// ============================================================================
// HANDOFF STATE
// ============================================================================

// NOTE: currentAgent state is now managed by state.ts to prevent state desync
// See FIX BUG comment above - executor.ts was maintaining its own state
// which caused getAgentContext() to return wrong identity after handoffs

/** Last handoff timestamp (for rate limiting) */
let lastHandoffTimestamp = 0;

/** Minimum time between handoffs (ms) */
const HANDOFF_COOLDOWN_MS = 2000;

// NOTE: handoffEvents is now imported from state.ts to ensure a single shared instance
// Previously, this module had its own EventEmitter which caused events to be emitted
// on a different instance than where handlers were registered.

// ============================================================================
// HANDOFF RECORD TRACKING
// ============================================================================

interface HandoffRecord {
  timestamp: number;
  from: AgentId;
  to: AgentId;
  reason: string;
  duration?: number;
}

const handoffHistory: HandoffRecord[] = [];
const MAX_HISTORY_LENGTH = 50;

function recordHandoff(from: AgentId, to: AgentId, reason: string): void {
  const now = Date.now();
  const lastRecord = handoffHistory[handoffHistory.length - 1];

  const record: HandoffRecord = {
    timestamp: now,
    from,
    to,
    reason,
    duration: lastRecord ? now - lastRecord.timestamp : undefined,
  };

  handoffHistory.push(record);

  if (handoffHistory.length > MAX_HISTORY_LENGTH) {
    handoffHistory.shift();
  }

  getLogger().debug({ handoff: record }, 'Handoff recorded');
}

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
  // Reset state.js state (includes rate limiting, current agent, met personas, etc.)
  resetStateHandoffState();
  // Reset executor-specific state
  lastHandoffTimestamp = 0;
  handoffHistory.length = 0;
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
  // Skip check for Ferni (coordinator is always available) or if explicitly skipped
  if (!options.skipUnlockCheck && canonicalTargetId !== 'ferni' && canonicalTargetId !== 'jack-b') {
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
    getLogger().warn({ targetAgentId, error: err }, 'Failed to get agent from registry');
  }

  // Get display name
  const targetAgentName = agent?.name || getPersonaDisplayName(canonicalTargetId);

  // Record the handoff
  lastHandoffTimestamp = Date.now();
  recordHandoff(previousAgent, canonicalTargetId as AgentId, reason);

  // Update current agent
  setCurrentAgent(canonicalTargetId as AgentId);

  // Generate greeting
  const greeting = await generateHandoffGreeting(canonicalTargetId, reason, previousAgent);

  // Build context continuation
  const contextContinuation = buildContextContinuation(reason);

  // Get voice ID for the target agent
  let voiceId: string | undefined;
  try {
    voiceId = getVoiceId(canonicalTargetId);
  } catch (err) {
    getLogger().warn({ targetAgentId }, 'Could not get voice ID');
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

  handoffEvents.emit('voiceSwitch', eventData);

  getLogger().info({ targetId: canonicalTargetId }, '✅ voiceSwitch event emitted');

  return {
    success: true,
    targetAgent: canonicalTargetId,
    targetAgentName,
    previousAgent,
    greeting,
    contextContinuation,
    instructions,
    voiceId,
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
    getLogger().warn({ error: err }, 'Could not get ALIVE entrance');
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
 * Build context continuation string from reason
 */
function buildContextContinuation(reason: string): string {
  if (!reason || reason.length < 10) {
    return '';
  }

  // Extract key topics from the reason
  const topics: string[] = [];

  if (reason.toLowerCase().includes('stock')) topics.push('stocks');
  if (reason.toLowerCase().includes('invest')) topics.push('investing');
  if (reason.toLowerCase().includes('budget')) topics.push('budgeting');
  if (reason.toLowerCase().includes('save')) topics.push('savings');
  if (reason.toLowerCase().includes('calendar')) topics.push('calendar');
  if (reason.toLowerCase().includes('goal')) topics.push('goals');
  if (reason.toLowerCase().includes('plan')) topics.push('planning');

  if (topics.length > 0) {
    return `The user was discussing: ${topics.join(', ')}. Original context: ${reason}`;
  }

  return `Context from previous conversation: ${reason}`;
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

INSTRUCTIONS:
1. Acknowledge the handoff naturally - you're picking up where someone else left off
2. Reference the context if relevant
3. Move forward with your expertise in this area
4. Stay in character as ${targetName}
5. Apply the cognitive insights above to match the user's thinking style`;
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export function getHandoffHistory(): readonly HandoffRecord[] {
  return [...handoffHistory];
}

export function getLastHandoff(): HandoffRecord | undefined {
  return handoffHistory[handoffHistory.length - 1];
}

export function clearHandoffHistory(): void {
  handoffHistory.length = 0;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default executeHandoff;
