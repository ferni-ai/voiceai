/**
 * Handoff State Management (GLOBAL STATE - DEPRECATED)
 *
 * ⚠️ DEPRECATED: This module uses GLOBAL state shared across all sessions.
 *
 * ## Recommended: Unified Handoff Module
 *
 * For new code, use the unified handoff module at `src/handoff/`:
 * ```typescript
 * import {
 *   getCurrentAgent,    // Session-scoped
 *   startHandoff,       // Session-scoped
 *   completeHandoff,    // Session-scoped
 *   isHandoffAllowed,   // Session-scoped
 *   handoffEvents,      // Event bus (re-exported from this file)
 * } from '../../handoff/index.js';
 * ```
 *
 * ## What's Still Valid in This File
 *
 * - `handoffEvents` - Event emitter for handoff coordination (re-exported by unified module)
 * - `cameoUnlockEvents` - Event emitter for cameo unlocks (re-exported by unified module)
 *
 * ## What's Deprecated
 *
 * - `getCurrentAgent()` without sessionId - Use `getCurrentAgent(sessionId)` from unified module
 * - `setCurrentAgent()` without sessionId - Use `setCurrentAgent(sessionId, agentId)` from unified module
 * - All other global state functions - Use session-scoped versions from unified module
 *
 * @deprecated Use `src/handoff/index.js` for new code
 * @see src/handoff/unified-state.ts for the new session-scoped implementation
 * @see docs/architecture/HANDOFF-CLEAN-ARCHITECTURE.md for migration guide
 */
import { EventEmitter } from 'events';
import type { AgentId } from '../../services/agent-bus.js';
import type { HandoffAnalytics, HandoffContext, HandoffRecord } from './types.js';
export { getActiveSessionIds, getSessionState, hasSessionState, removeSessionState, type HandoffSessionState, } from './session-state.js';
/**
 * Global event emitter for agent handoff events.
 *
 * Events:
 * - 'voiceSwitch': Fired when a handoff occurs, with { toAgentId, greeting }
 * - 'handoffComplete': Fired after handoff is fully processed
 * - 'handoffFailed': Fired if handoff fails
 * - 'handoffHandlerComplete': Fired by handler when handoff is fully processed (for sync waiting)
 */
export declare const handoffEvents: EventEmitter<[never]>;
/**
 * Global event emitter for cameo unlock events.
 *
 * CAMEO UNLOCK SYSTEM: These events fire when Ferni introduces a new team member.
 * The voice agent listens for these and sends data messages to the frontend.
 *
 * Events:
 * - 'memberUnlocked': Fired when introduceMember tool completes, with:
 *   { memberId, displayName, role, spokenIntro }
 */
export declare const cameoUnlockEvents: EventEmitter<[never]>;
/**
 * Normalize any agent ID to canonical form for internal tracking.
 *
 * REFACTORED: Now delegates to AgentDirectory which auto-discovers
 * all agents from their bundle manifests. No hardcoded mapping!
 *
 * @param agentId - Any agent ID, alias, or name
 * @returns Canonical agent ID
 */
export declare function toCanonicalId(agentId: string): AgentId;
/**
 * Check if two agent IDs refer to the same persona (handles all ID formats).
 */
export declare function isSameAgent(id1: string, id2: string): boolean;
/**
 * Check if a handoff is allowed based on rate limiting.
 * Returns true if handoff is allowed, false if too soon after last handoff.
 *
 * REFACTORED: Uses shared HANDOFF_TIMING constants from design system.
 * FIX BUG #2: No longer updates timestamp here - that's done in recordHandoff()
 * This prevents the timestamp being updated when we're just checking (not executing)
 */
export declare function isHandoffAllowed(): boolean;
/**
 * Get the current active agent (returns canonical ID)
 */
export declare function getCurrentAgent(): AgentId;
/**
 * Set the current active agent (normalizes to canonical ID)
 * FIX BUG: Now clears stale identity cache and pre-fetches new agent context
 */
export declare function setCurrentAgent(agent: AgentId): void;
/**
 * Check if the current agent matches a given ID (handles all ID formats)
 */
export declare function isCurrentAgent(agentId: string): boolean;
/**
 * Record a handoff in history (full record version)
 */
export declare function recordHandoffRecord(record: HandoffRecord): void;
/**
 * Record a handoff in history (convenience version with separate params)
 * FIX BUG #2: Also updates rate limiting timestamp for single source of truth
 * PERFORMANCE: Also broadcasts via Redis Pub/Sub for cross-instance notifications
 */
export declare function recordHandoff(from: AgentId, to: AgentId, reason: string): void;
/**
 * Get handoff history
 */
export declare function getHandoffHistory(): readonly HandoffRecord[];
/**
 * Get the last handoff record
 */
export declare function getLastHandoff(): HandoffRecord | undefined;
/**
 * Clear handoff history
 */
export declare function clearHandoffHistory(): void;
/**
 * Reset all handoff state
 */
export declare function resetHandoffState(): void;
/**
 * Capture context for a handoff
 *
 * @deprecated Use the session-scoped version from handoff-state.ts instead:
 *   import { captureHandoffContext } from '../handoff-state.js';
 *   captureHandoffContext(state, context);
 *
 * This global version should only be used when session state is not available.
 */
export declare function captureHandoffContext(context: Partial<HandoffContext>): void;
/**
 * Get the current handoff context
 */
export declare function getHandoffContext(): HandoffContext | null;
/**
 * Format handoff context for agent consumption
 */
export declare function formatHandoffContextForAgent(): string;
/**
 * Check if user has met a persona before
 */
export declare function hasMetPersona(personaId: string): boolean;
/**
 * Mark a persona as met
 */
export declare function markPersonaAsMet(personaId: string): void;
/**
 * Reset met personas (for new session)
 */
export declare function resetMetPersonas(): void;
/**
 * Get all met personas
 */
export declare function getMetPersonas(): string[];
/**
 * Get handoff analytics
 */
export declare function getHandoffAnalytics(): HandoffAnalytics;
/**
 * Log handoff analytics
 */
export declare function logHandoffAnalytics(): void;
/**
 * Update user context for alive entrances
 * Call this when user speaks or emotion is detected
 */
export declare function updateUserContextForHandoff(context: {
    lastUserMessage?: string;
    emotionAnalysis?: {
        primary: string;
        intensity: number;
        distressLevel?: number;
    };
}): void;
/**
 * Get the last user message (for mood detection)
 */
export declare function getLastUserMessage(): string;
/**
 * Get the last emotion analysis (for mood detection)
 */
export declare function getLastEmotionAnalysis(): {
    primary: string;
    intensity: number;
    distressLevel?: number;
} | undefined;
/**
 * Initialize handoff context from user profile (for cross-session persistence)
 * Call this when starting a session with a known user
 */
export declare function initializeHandoffContext(context: {
    meetingCounts?: Record<string, number>;
    lastTopics?: Record<string, string>;
    persistMeetingCounts?: (counts: Record<string, number>) => void;
    persistLastTopics?: (topics: Record<string, string>) => void;
}): void;
/**
 * Get current meeting counts (for persistence on session end)
 */
export declare function getMeetingCounts(): Record<string, number>;
/**
 * Get current last topics per persona (for persistence on session end)
 */
export declare function getLastTopicsPerPersona(): Record<string, string>;
/**
 * Update last topic for a persona (for memory callbacks)
 */
export declare function setLastTopicForPersona(personaId: string, topic: string): void;
/**
 * Get last topic for a persona
 */
export declare function getLastTopicForPersona(personaId: string): string | undefined;
/**
 * Increment meeting count for a persona
 * Returns the new count and triggers persistence if callback is registered
 */
export declare function incrementMeetingCount(personaId: string): number;
/**
 * Get meeting count for a persona
 */
export declare function getMeetingCount(personaId: string): number;
/**
 * Get a human-readable display name for an agent.
 *
 * REFACTORED: Now delegates to AgentDirectory which reads from manifests.
 * No hardcoded display names - add a new agent and it works automatically!
 */
export declare function getAgentDisplayName(agentId: string): string;
/**
 * Get display name asynchronously (preferred for new code)
 */
export declare function getAgentDisplayNameAsync(agentId: string): Promise<string>;
/**
 * Get additional context instructions based on current agent.
 * This provides agent-specific tool guidance for the LLM.
 *
 * REFACTORED: Now reads from persona.manifest.json files via AgentDirectory.
 * The llm_context section in each manifest contains:
 * - identity_reminder: Who the agent is
 * - role_summary: What they do
 * - tool_guidance: Available tools organized by category
 *
 * FIX BUG: Previously returned stale cached context from WRONG persona after handoffs!
 * Now returns empty string if cache is stale (forces async refresh).
 *
 * FIX BUG #5: Added fallback identity context to prevent LLM identity confusion
 * when async context hasn't loaded yet.
 *
 * @returns Agent context string from manifest, or fallback identity if not found/stale
 */
export declare function getAgentContext(): string;
/**
 * Async version of getAgentContext - preferred when you can await.
 * Loads context from manifest via AgentDirectory.
 */
export declare function getAgentContextAsync(): Promise<string>;
/**
 * Normalize any agent ID to canonical form for internal tracking.
 * This is an alias for toCanonicalId for backward compatibility.
 */
export declare function normalizeAgentId(agentId: string): AgentId;
/**
 * Suggest a handoff based on user input.
 * Returns whether a handoff is suggested and to which agent.
 */
export declare function suggestHandoff(userInput: string): {
    suggest: boolean;
    to: AgentId | null;
    reason: string | null;
};
/**
 * Get all available team members for handoff.
 *
 * REFACTORED: Now delegates to AgentDirectory.
 * No hardcoded team list - discovered from manifests!
 *
 * FIX BUG #4 & #7: Eagerly loads at module init, returns minimal fallback only if needed.
 * First call usually has cached data from eager load.
 */
export declare function getTeamForHandoff(): Array<{
    id: AgentId;
    name: string;
    specialty: string;
}>;
/**
 * Get all available team members for handoff (async version).
 * Preferred over sync version for new code.
 */
export declare function getTeamForHandoffAsync(): Promise<Array<{
    id: string;
    name: string;
    specialty: string;
    emoji: string;
}>>;
//# sourceMappingURL=state.d.ts.map