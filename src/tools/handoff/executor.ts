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

import { getLogger } from '../../utils/safe-logger.js';
import { EventEmitter } from 'events';
import { getCanonicalPersonaId, getPersonaDisplayName, getVoiceId } from '../../personas/voice-registry.js';
import { AgentRegistry } from '../../personas/registry/unified-registry.js';
import { createHandoffEvent } from '../../personas/PersonaRegistry.js';
import { getAliveEntranceForHandoff, detectUserMoodFromContext } from '../../personas/alive-entrances.js';
import type { AgentId } from '../../services/agent-bus.js';
// FIX BUG: Import state management from state.ts to keep state in sync
import {
  getCurrentAgent as getStateCurrentAgent,
  setCurrentAgent as setStateCurrentAgent,
  isSameAgent as stateSameAgent,
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

/** Global event emitter for handoff events */
export const handoffEvents = new EventEmitter();

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
  };
}

/**
 * Get the captured handoff context
 */
export function getHandoffContext(): HandoffContext | null {
  return conversationContext;
}

// ============================================================================
// AGENT STATE - Delegated to state.ts for consistency
// ============================================================================

/**
 * Get the current active agent
 * FIX BUG: Delegates to state.ts to keep state in sync with getAgentContext()
 */
export function getCurrentAgent(): AgentId {
  return getStateCurrentAgent();
}

/**
 * Set the current active agent
 * FIX BUG: Delegates to state.ts to keep state in sync with getAgentContext()
 */
export function setCurrentAgent(agentId: AgentId): void {
  setStateCurrentAgent(agentId);
}

/**
 * Check if two agent IDs refer to the same agent
 * FIX BUG: Delegates to state.ts for consistent ID normalization
 */
export function isSameAgent(id1: string, id2: string): boolean {
  return stateSameAgent(id1, id2);
}

/**
 * Check if handoff is allowed (rate limiting)
 */
export function isHandoffAllowed(): boolean {
  const now = Date.now();
  if (now - lastHandoffTimestamp < HANDOFF_COOLDOWN_MS) {
    getLogger().warn({ timeSinceLastMs: now - lastHandoffTimestamp }, 'Handoff rate limited');
    return false;
  }
  return true;
}

/**
 * Reset handoff state
 */
export function resetHandoffState(): void {
  setStateCurrentAgent('ferni');
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
  const previousAgent = getStateCurrentAgent();

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
  handoffEvents.emit(
    'voiceSwitch',
    createHandoffEvent(canonicalTargetId, {
      greeting,
      playSound: options.playSound,
      previousAgentId: previousAgent,
    })
  );

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
    const entranceContext = {
      previousAgentId: previousAgent,
      reason,
      mood: detectUserMoodFromContext(reason),
    };

    const aliveEntrance = await getAliveEntranceForHandoff(
      targetAgentId,
      entranceContext as any
    );

    if (aliveEntrance) {
      return aliveEntrance;
    }
  } catch (err) {
    getLogger().warn({ error: err }, 'Could not get ALIVE entrance');
  }

  // Fall back to a generic greeting
  return `Hi there! ${targetName} here. ${getReasonAcknowledgment(reason)}`;
}

/**
 * Generate a reason acknowledgment phrase
 */
function getReasonAcknowledgment(reason: string): string {
  const reasonLower = reason.toLowerCase();

  if (reasonLower.includes('stock') || reasonLower.includes('invest')) {
    return "I hear we're talking investments!";
  }
  if (reasonLower.includes('budget') || reasonLower.includes('save') || reasonLower.includes('spend')) {
    return "Let's talk about your finances!";
  }
  if (reasonLower.includes('calendar') || reasonLower.includes('schedule') || reasonLower.includes('email')) {
    return 'I can help with that scheduling!';
  }
  if (reasonLower.includes('goal') || reasonLower.includes('plan') || reasonLower.includes('milestone')) {
    return "Let's work on your plans!";
  }

  return "How can I help you?";
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

  return `You are now ${targetName}. A handoff just occurred.

HANDOFF REASON: ${reason}

${contextContinuation ? `CONTEXT: ${contextContinuation}` : ''}

INSTRUCTIONS:
1. Acknowledge the handoff naturally - you're picking up where someone else left off
2. Reference the context if relevant
3. Move forward with your expertise in this area
4. Stay in character as ${targetName}`;
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

