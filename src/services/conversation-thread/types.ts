/**
 * Conversation Thread Types
 *
 * Core types for the unified conversation thread system.
 * A thread represents a continuous conversation that can span:
 * - Multiple channels (voice, SMS, email, push, in-app)
 * - Multiple agents (Ferni, Maya, Peter, etc.)
 * - Multiple sessions (user can call back hours later)
 *
 * @module services/conversation-thread/types
 */

import type { PersonaId } from '../../personas/types.js';

// ============================================================================
// CHANNEL TYPES
// ============================================================================

export type EngagementChannel = 'voice' | 'sms' | 'email' | 'push' | 'in_app' | 'call';

export type EngagementDirection = 'inbound' | 'outbound';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: 'agent' | 'user' | 'system';
  /** Which agent sent this (if role === 'agent') */
  agentId?: PersonaId;
  /** Which channel this message was on */
  channel: EngagementChannel;
  /** Direction of engagement */
  direction: EngagementDirection;
  /** Message content */
  content: string;
  /** When the message was sent/received */
  timestamp: Date;
  /** Additional metadata */
  metadata?: {
    sentiment?: 'positive' | 'neutral' | 'negative';
    intent?: string;
    toolCalls?: string[];
    /** If this was a response to outreach */
    outreachId?: string;
    /** If this triggered a channel switch */
    triggeredChannelSwitch?: boolean;
  };
}

// ============================================================================
// THREAD TYPES
// ============================================================================

export type ThreadStatus = 'active' | 'paused' | 'closed';

export interface OwnershipTransfer {
  fromAgentId: PersonaId;
  toAgentId: PersonaId;
  transferredAt: Date;
  reason: string;
}

export interface ConversationThread {
  /** Unique thread ID */
  id: string;
  /** User this thread belongs to */
  userId: string;

  // ---------------------------------------------------------
  // OWNERSHIP
  // ---------------------------------------------------------
  /** Current owner (which agent "owns" the conversation) */
  currentOwnerId: PersonaId;
  /** History of ownership transfers */
  ownershipHistory: OwnershipTransfer[];

  // ---------------------------------------------------------
  // CHANNELS
  // ---------------------------------------------------------
  /** All channels used in this thread */
  channelsUsed: EngagementChannel[];
  /** The channel that started this thread */
  originChannel: EngagementChannel;
  /** Most recent channel */
  lastChannel: EngagementChannel;

  // ---------------------------------------------------------
  // MESSAGES
  // ---------------------------------------------------------
  /** Messages in this thread (loaded on demand) */
  messages: ThreadMessage[];
  /** Total message count */
  messageCount: number;

  // ---------------------------------------------------------
  // TIMING
  // ---------------------------------------------------------
  /** When thread started */
  startedAt: Date;
  /** Last activity */
  lastActivityAt: Date;
  /** Last message from agent */
  lastAgentMessageAt?: Date;
  /** Last message from user */
  lastUserMessageAt?: Date;

  // ---------------------------------------------------------
  // CONTEXT
  // ---------------------------------------------------------
  /** What triggered this thread (if started by outreach) */
  triggerType?: string;
  /** Outreach ID if this came from proactive outreach */
  outreachId?: string;
  /** Topics discussed */
  topicTags: string[];
  /** Emotional context */
  emotionalContext?: {
    current: string;
    trajectory: 'improving' | 'stable' | 'declining';
  };

  // ---------------------------------------------------------
  // STATUS
  // ---------------------------------------------------------
  /** Thread status */
  status: ThreadStatus;
  /** Why thread was closed/paused (if applicable) */
  statusReason?: string;
}

// ============================================================================
// HANDOFF TYPES
// ============================================================================

export interface CrossChannelHandoff {
  /** Source of handoff */
  from: {
    agentId: PersonaId;
    channel: EngagementChannel;
    sessionId?: string;
  };
  /** Target of handoff */
  to: {
    agentId: PersonaId;
    channel: EngagementChannel;
  };
  /** Why the handoff is happening */
  reason: string;
  /** Thread being handed off */
  threadId: string;
  /** When to execute (immediate if not specified) */
  scheduledFor?: Date;
  /** Message to user during handoff */
  handoffMessage?: string;
}

// ============================================================================
// AGENT CONTEXT
// ============================================================================

/**
 * Context provided to an agent when they join/continue a thread.
 * This is what gets injected into the LLM.
 */
export interface AgentThreadContext {
  /** The thread */
  thread: ConversationThread;
  /** Recent messages (last N) */
  recentMessages: ThreadMessage[];
  /** Summary of older messages */
  historySummary?: string;
  /** Whether this agent is new to the thread */
  isNewToThread: boolean;
  /** Previous owner (if handoff) */
  previousOwner?: PersonaId;
  /** Reason for joining (if handoff) */
  joinReason?: string;
  /** Whether user initiated this interaction */
  userInitiated: boolean;
  /** Formatted context for LLM injection */
  llmContext: string;
}

// ============================================================================
// ROUTING TYPES
// ============================================================================

export interface InboundRouteDecision {
  /** Which agent should handle this */
  agentId: PersonaId;
  /** Confidence in this decision */
  confidence: number;
  /** Reason for routing decision */
  reason: string;
  /** Existing thread to continue (if any) */
  threadId?: string;
  /** Should we acknowledge the previous outreach? */
  acknowledgeOutreach?: boolean;
}

export interface OutreachInitiation {
  /** User to reach */
  userId: string;
  /** Which agent is initiating */
  agentId: PersonaId;
  /** Which channel to use */
  channel: EngagementChannel;
  /** Message content */
  message: string;
  /** Why we're reaching out */
  triggerType: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'urgent';
  /** Schedule for later? */
  scheduledFor?: Date;
  /** Existing thread to continue (if any) */
  threadId?: string;
}
