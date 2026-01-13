/**
 * Unified Handoff Types
 *
 * Single source of truth for all handoff-related types.
 *
 * @module handoff/types
 */
import type { AgentId } from '../services/agent-bus.js';
/**
 * Handoff record for history tracking.
 */
export interface HandoffRecord {
    /** Timestamp of the handoff */
    timestamp: number;
    /** Agent handing off from (canonical ID) */
    from: AgentId;
    /** Agent handing off to (canonical ID) */
    to: AgentId;
    /** Reason for handoff */
    reason: string;
    /** Duration of handoff process in ms */
    duration?: number;
    /** Whether handoff succeeded */
    success?: boolean;
    /** Trace ID for debugging */
    traceId?: string;
}
/**
 * Context passed during a handoff.
 */
export interface HandoffContext {
    /** Reason for handoff (user-friendly) */
    reason: string;
    /** Topics discussed before handoff */
    previousTopics?: string[];
    /** User's emotional state */
    emotionalContext?: {
        primary: string;
        intensity: number;
        distressLevel?: number;
    };
    /** Tool execution context */
    toolContext?: ToolExecutionContext;
    /** Custom metadata */
    metadata?: Record<string, unknown>;
}
/**
 * Tool execution record for context transfer.
 */
export interface ToolExecutionRecord {
    /** Tool ID that was executed */
    toolId: string;
    /** Tool arguments */
    args: Record<string, unknown>;
    /** Tool result summary (truncated for context) */
    resultSummary: string;
    /** Whether execution was successful */
    success: boolean;
    /** Timestamp of execution */
    timestamp: number;
    /** Semantic routing confidence (if from router) */
    routingConfidence?: number;
}
/**
 * Tool execution context that persists across handoffs.
 */
export interface ToolExecutionContext {
    /** Recent tool executions (last 10) */
    recentTools: ToolExecutionRecord[];
    /** Semantic routing history (last 5 queries with matches) */
    routingHistory: Array<{
        query: string;
        matches: Array<{
            toolId: string;
            confidence: number;
        }>;
        timestamp: number;
    }>;
    /** Active tool sessions (e.g., music playing, timer running) */
    activeToolSessions: Map<string, {
        toolId: string;
        state: Record<string, unknown>;
        startedAt: number;
    }>;
    /** User's frequent tools (for personalization) */
    frequentTools: string[];
}
/**
 * Immutable state snapshot.
 */
export interface HandoffStateSnapshot {
    /** Session ID */
    readonly sessionId: string;
    /** Current active agent (canonical ID) */
    readonly currentAgent: AgentId;
    /** Previous agent (canonical ID) */
    readonly previousAgent: AgentId | null;
    /** Whether a handoff is in progress */
    readonly isInProgress: boolean;
    /** Target agent for current handoff */
    readonly targetAgent: AgentId | null;
    /** When current handoff started */
    readonly handoffStartTime: number | null;
    /** When last handoff completed */
    readonly lastHandoffTime: number;
    /** Personas the user has met */
    readonly metPersonas: ReadonlySet<string>;
    /** Total handoff count for this session */
    readonly handoffCount: number;
}
/**
 * Pending handoff request in queue.
 */
export interface PendingHandoff {
    /** Target persona ID */
    targetPersonaId: string;
    /** Reason for handoff */
    reason: string;
    /** When this was queued */
    queuedAt: number;
    /** Context for handoff */
    context?: HandoffContext;
}
/**
 * Queue and timeout state for handoff handler.
 */
export interface HandoffQueueState {
    /** Whether a handoff is currently being processed */
    isHandoffInProgress: boolean;
    /** Pending handoffs queue */
    pendingHandoffs: PendingHandoff[];
    /** Timeout timer handle */
    timeoutTimer: ReturnType<typeof setTimeout> | null;
    /** When current handoff started */
    handoffStartTime: number | null;
    /** Progress heartbeat interval */
    progressInterval: ReturnType<typeof setInterval> | null;
    /** Target persona for current handoff */
    targetPersonaId: string | null;
    /** Previous persona before handoff */
    previousPersonaId: string | null;
    /** Message sequence number */
    messageSeq: number;
}
/**
 * State change event types.
 */
export type StateChangeType = 'agent_changed' | 'handoff_started' | 'handoff_completed' | 'handoff_failed' | 'persona_met' | 'state_reset';
/**
 * State change event payload.
 */
export interface StateChangeEvent {
    /** Type of state change */
    type: StateChangeType;
    /** Session ID */
    sessionId: string;
    /** When the change occurred */
    timestamp: number;
    /** State before change */
    previousState: HandoffStateSnapshot;
    /** State after change */
    newState: HandoffStateSnapshot;
    /** Additional event data */
    data?: Record<string, unknown>;
}
/**
 * State change listener function.
 */
export type StateChangeListener = (event: StateChangeEvent) => void;
/**
 * @deprecated Use HandoffStateSnapshot instead
 */
export type HandoffSessionState = HandoffQueueState;
/**
 * @deprecated Use HandoffQueueState instead
 */
export type HandoffHandlerState = HandoffQueueState;
//# sourceMappingURL=types.d.ts.map