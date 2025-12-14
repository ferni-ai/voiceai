/**
 * Handoff State Management
 * Manages current agent state, history, and context
 *
 * REFACTORED: Now uses AgentDirectory for ID normalization.
 * The hardcoded mapping tables have been removed.
 *
 * ⚠️ MIGRATION NOTICE:
 * This module contains GLOBAL state that is shared across all sessions.
 * For new code, prefer the session-scoped state from './session-state.js':
 *
 * ```typescript
 * // New (preferred) - session-isolated state
 * import { getSessionState, getCurrentAgent } from './session-state.js';
 * const state = getSessionState(sessionId);
 * const agent = getCurrentAgent(state);
 *
 * // Old (legacy) - global state
 * import { getCurrentAgent } from './state.js';
 * const agent = getCurrentAgent();
 * ```
 *
 * @see session-state.ts for the new session-scoped implementation
 * @see docs/audits/AGENT-TRANSFER-BUGS-GAPS.md for migration context
 */

import { EventEmitter } from 'events';
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';
import { AgentDirectory, normalizeAgentIdSync } from '../../personas/agent-directory.js';
import type { AgentId } from '../../services/agent-bus.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { HandoffAnalytics, HandoffContext, HandoffRecord } from './types.js';

// Re-export session-scoped state for new code
export {
  getSessionState,
  hasSessionState,
  removeSessionState,
  getActiveSessionIds,
  type HandoffSessionState,
} from './session-state.js';

// ============================================================================
// HANDOFF EVENTS
// ============================================================================

/**
 * Global event emitter for agent handoff events.
 *
 * Events:
 * - 'voiceSwitch': Fired when a handoff occurs, with { toAgentId, greeting }
 * - 'handoffComplete': Fired after handoff is fully processed
 * - 'handoffFailed': Fired if handoff fails
 * - 'handoffHandlerComplete': Fired by handler when handoff is fully processed (for sync waiting)
 */
export const handoffEvents = new EventEmitter();

// Increase max listeners to handle multiple concurrent handoffs
handoffEvents.setMaxListeners(20);

// ============================================================================
// STATE
// ============================================================================

// Track current active agent (uses CANONICAL IDs: ferni, alex-chen, maya-santos, jordan-taylor, etc.)
// IMPORTANT: All internal tracking uses canonical IDs. Frontend IDs are only used when emitting events.
let currentAgent: AgentId = 'ferni'; // Start with coordinator (canonical ID)

// Handoff history
const handoffHistory: HandoffRecord[] = [];
const MAX_HISTORY_LENGTH = 100;

// Handoff context (from last handoff)
let handoffContext: HandoffContext | null = null;

// Handoff rate limiting - uses shared timing constants
let lastHandoffTimestamp = 0;

// Met personas tracking (for first-time introductions)
const metPersonas = new Set<string>();

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize AgentDirectory cache at module load
// This enables synchronous ID normalization
void AgentDirectory.initialize().catch((err) => {
  getLogger().warn({ error: err }, 'Failed to initialize AgentDirectory');
});

// ============================================================================
// ID NORMALIZATION
// ============================================================================

/**
 * Normalize any agent ID to canonical form for internal tracking.
 *
 * REFACTORED: Now delegates to AgentDirectory which auto-discovers
 * all agents from their bundle manifests. No hardcoded mapping!
 *
 * @param agentId - Any agent ID, alias, or name
 * @returns Canonical agent ID
 */
export function toCanonicalId(agentId: string): AgentId {
  return normalizeAgentIdSync(agentId) as AgentId;
}

/**
 * Check if two agent IDs refer to the same persona (handles all ID formats).
 */
export function isSameAgent(id1: string, id2: string): boolean {
  return toCanonicalId(id1) === toCanonicalId(id2);
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if a handoff is allowed based on rate limiting.
 * Returns true if handoff is allowed, false if too soon after last handoff.
 *
 * REFACTORED: Uses shared HANDOFF_TIMING constants from design system.
 */
export function isHandoffAllowed(): boolean {
  const now = Date.now();
  const timeSinceLastHandoff = now - lastHandoffTimestamp;

  if (timeSinceLastHandoff < HANDOFF_TIMING.DEBOUNCE_MS) {
    getLogger().warn(
      {
        timeSinceLastHandoff,
        minInterval: HANDOFF_TIMING.DEBOUNCE_MS,
      },
      '⏸️ Handoff rate-limited (too soon after last handoff)'
    );
    return false;
  }

  lastHandoffTimestamp = now;
  return true;
}

// ============================================================================
// CURRENT AGENT
// ============================================================================

/**
 * Get the current active agent (returns canonical ID)
 */
export function getCurrentAgent(): AgentId {
  return currentAgent;
}

/**
 * Set the current active agent (normalizes to canonical ID)
 * FIX BUG: Now clears stale identity cache and pre-fetches new agent context
 */
export function setCurrentAgent(agent: AgentId): void {
  const canonical = toCanonicalId(agent);
  const previousAgent = currentAgent;
  currentAgent = canonical;

  // FIX BUG: Clear stale identity cache to prevent identity confusion
  // (e.g., Alex thinking he's Nayan because old context was cached)
  if (cachedAgentContext && cachedAgentContext.agentId !== canonical) {
    getLogger().debug(
      { previousAgent, newAgent: canonical, cachedAgent: cachedAgentContext.agentId },
      'Clearing stale agent context cache on handoff'
    );
    cachedAgentContext = null;
  }

  // Pre-fetch new agent context in background for faster subsequent lookups
  void fetchAgentContextAsync(canonical);

  getLogger().info({ agent, canonical, previousAgent }, 'Active agent changed');
}

/**
 * Check if the current agent matches a given ID (handles all ID formats)
 */
export function isCurrentAgent(agentId: string): boolean {
  return isSameAgent(currentAgent, agentId);
}

// ============================================================================
// HANDOFF HISTORY
// ============================================================================

/**
 * Record a handoff in history
 */
export function recordHandoff(record: HandoffRecord): void {
  handoffHistory.push(record);

  // Trim history if too long
  if (handoffHistory.length > MAX_HISTORY_LENGTH) {
    handoffHistory.shift();
  }
}

/**
 * Get handoff history
 */
export function getHandoffHistory(): readonly HandoffRecord[] {
  return handoffHistory;
}

/**
 * Get the last handoff record
 */
export function getLastHandoff(): HandoffRecord | undefined {
  return handoffHistory[handoffHistory.length - 1];
}

/**
 * Clear handoff history
 */
export function clearHandoffHistory(): void {
  handoffHistory.length = 0;
}

/**
 * Reset all handoff state
 */
export function resetHandoffState(): void {
  currentAgent = 'ferni';
  handoffHistory.length = 0;
  handoffContext = null;
  lastHandoffTimestamp = 0;
  metPersonas.clear();
}

// ============================================================================
// HANDOFF CONTEXT
// ============================================================================

/**
 * Capture context for a handoff
 *
 * @deprecated Use the session-scoped version from handoff-state.ts instead:
 *   import { captureHandoffContext } from '../handoff-state.js';
 *   captureHandoffContext(state, context);
 *
 * This global version should only be used when session state is not available.
 */
export function captureHandoffContext(context: Partial<HandoffContext>): void {
  handoffContext = {
    reason: context.reason || 'user_request',
    conversationSummary: context.conversationSummary,
    userGoal: context.userGoal,
    userData: context.userData,
    timestamp: Date.now(),
  };
}

/**
 * Get the current handoff context
 */
export function getHandoffContext(): HandoffContext | null {
  return handoffContext;
}

/**
 * Format handoff context for agent consumption
 */
export function formatHandoffContextForAgent(): string {
  if (!handoffContext) {
    return '';
  }

  const parts: string[] = [];

  if (handoffContext.reason) {
    parts.push(`Handoff reason: ${handoffContext.reason}`);
  }
  if (handoffContext.conversationSummary) {
    parts.push(`Previous conversation: ${handoffContext.conversationSummary}`);
  }
  if (handoffContext.userGoal) {
    parts.push(`User's goal: ${handoffContext.userGoal}`);
  }

  return parts.join('\n');
}

// ============================================================================
// MET PERSONAS
// ============================================================================

/**
 * Check if user has met a persona before
 */
export function hasMetPersona(personaId: string): boolean {
  return metPersonas.has(toCanonicalId(personaId));
}

/**
 * Mark a persona as met
 */
export function markPersonaAsMet(personaId: string): void {
  metPersonas.add(toCanonicalId(personaId));
}

/**
 * Reset met personas (for new session)
 */
export function resetMetPersonas(): void {
  metPersonas.clear();
}

/**
 * Get all met personas
 */
export function getMetPersonas(): string[] {
  return Array.from(metPersonas);
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get handoff analytics
 */
export function getHandoffAnalytics(): HandoffAnalytics {
  const bySource: Record<string, number> = {};
  const byTarget: Record<string, number> = {};
  const pairCounts: Record<string, number> = {};
  let totalDuration = 0;
  let durationCount = 0;

  for (const record of handoffHistory) {
    // Count by source
    bySource[record.from] = (bySource[record.from] || 0) + 1;

    // Count by target
    byTarget[record.to] = (byTarget[record.to] || 0) + 1;

    // Count pairs
    const pairKey = `${record.from}->${record.to}`;
    pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;

    // Track duration
    if (record.duration) {
      totalDuration += record.duration;
      durationCount++;
    }
  }

  // Find most common pair
  let mostCommonPair: { from: string; to: string; count: number } | undefined;
  let maxCount = 0;
  for (const [pair, count] of Object.entries(pairCounts)) {
    if (count > maxCount) {
      maxCount = count;
      const [from, to] = pair.split('->');
      mostCommonPair = { from, to, count };
    }
  }

  return {
    totalHandoffs: handoffHistory.length,
    bySource,
    byTarget,
    avgDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    mostCommonPair,
  };
}

/**
 * Log handoff analytics
 */
export function logHandoffAnalytics(): void {
  const analytics = getHandoffAnalytics();
  getLogger().info(
    {
      totalHandoffs: analytics.totalHandoffs,
      bySource: analytics.bySource,
      byTarget: analytics.byTarget,
      avgDuration: analytics.avgDuration,
      mostCommonPair: analytics.mostCommonPair,
    },
    '📊 Handoff Analytics'
  );
}

// ============================================================================
// USER CONTEXT FOR HANDOFFS
// ============================================================================

// Mood detection state
let lastUserMessageForMood = '';
let lastEmotionAnalysisForMood:
  | { primary: string; intensity: number; distressLevel?: number }
  | undefined;

// Per-persona meeting counts (for "first time" vs "returning" entrances)
let perPersonaMeetingCount = new Map<string, number>();
let perPersonaLastTopic = new Map<string, string>();

// Persistence callbacks (for cross-session state)
let persistMeetingCountsCallback: ((counts: Record<string, number>) => void) | null = null;
let persistLastTopicsCallback: ((topics: Record<string, string>) => void) | null = null;

/**
 * Update user context for alive entrances
 * Call this when user speaks or emotion is detected
 */
export function updateUserContextForHandoff(context: {
  lastUserMessage?: string;
  emotionAnalysis?: { primary: string; intensity: number; distressLevel?: number };
}): void {
  if (context.lastUserMessage) {
    lastUserMessageForMood = context.lastUserMessage;
  }
  if (context.emotionAnalysis) {
    lastEmotionAnalysisForMood = context.emotionAnalysis;
  }
}

/**
 * Get the last user message (for mood detection)
 */
export function getLastUserMessage(): string {
  return lastUserMessageForMood;
}

/**
 * Get the last emotion analysis (for mood detection)
 */
export function getLastEmotionAnalysis():
  | { primary: string; intensity: number; distressLevel?: number }
  | undefined {
  return lastEmotionAnalysisForMood;
}

/**
 * Initialize handoff context from user profile (for cross-session persistence)
 * Call this when starting a session with a known user
 */
export function initializeHandoffContext(context: {
  meetingCounts?: Record<string, number>;
  lastTopics?: Record<string, string>;
  persistMeetingCounts?: (counts: Record<string, number>) => void;
  persistLastTopics?: (topics: Record<string, string>) => void;
}): void {
  // Load meeting counts from persistent storage
  if (context.meetingCounts) {
    perPersonaMeetingCount = new Map(Object.entries(context.meetingCounts));
    getLogger().info(
      { count: perPersonaMeetingCount.size },
      '📊 Loaded per-persona meeting counts from profile'
    );
  }

  // Load last topics from persistent storage
  if (context.lastTopics) {
    perPersonaLastTopic = new Map(Object.entries(context.lastTopics));
    getLogger().debug(
      { topics: Object.keys(context.lastTopics) },
      '📝 Loaded per-persona last topics'
    );
  }

  // Register persistence callbacks
  if (context.persistMeetingCounts) {
    persistMeetingCountsCallback = context.persistMeetingCounts;
    getLogger().debug('Registered meeting counts persistence callback');
  }
  if (context.persistLastTopics) {
    persistLastTopicsCallback = context.persistLastTopics;
  }
}

/**
 * Get current meeting counts (for persistence on session end)
 */
export function getMeetingCounts(): Record<string, number> {
  return Object.fromEntries(perPersonaMeetingCount);
}

/**
 * Get current last topics per persona (for persistence on session end)
 */
export function getLastTopicsPerPersona(): Record<string, string> {
  return Object.fromEntries(perPersonaLastTopic);
}

/**
 * Update last topic for a persona (for memory callbacks)
 */
export function setLastTopicForPersona(personaId: string, topic: string): void {
  perPersonaLastTopic.set(personaId, topic);

  // Persist if callback is registered
  if (persistLastTopicsCallback) {
    persistLastTopicsCallback(Object.fromEntries(perPersonaLastTopic));
  }
}

/**
 * Get last topic for a persona
 */
export function getLastTopicForPersona(personaId: string): string | undefined {
  return perPersonaLastTopic.get(personaId);
}

/**
 * Increment meeting count for a persona
 * Returns the new count and triggers persistence if callback is registered
 */
export function incrementMeetingCount(personaId: string): number {
  const current = perPersonaMeetingCount.get(personaId) || 0;
  const newCount = current + 1;
  perPersonaMeetingCount.set(personaId, newCount);

  // Persist if callback is registered
  if (persistMeetingCountsCallback) {
    persistMeetingCountsCallback(Object.fromEntries(perPersonaMeetingCount));
  }

  return newCount;
}

/**
 * Get meeting count for a persona
 */
export function getMeetingCount(personaId: string): number {
  return perPersonaMeetingCount.get(personaId) || 0;
}

// ============================================================================
// AGENT DISPLAY UTILITIES
// ============================================================================

/**
 * Get a human-readable display name for an agent.
 *
 * REFACTORED: Now delegates to AgentDirectory which reads from manifests.
 * No hardcoded display names - add a new agent and it works automatically!
 */
export function getAgentDisplayName(agentId: string): string {
  // Use synchronous lookup since AgentDirectory is initialized at module load
  const canonical = toCanonicalId(agentId);

  // Try to get from cached directory (fast path)
  // Fall back to ID if cache not ready
  // FIX BUG: Add error handling to prevent unhandled promise rejections
  AgentDirectory.getDisplayName(canonical)
    .then(() => {
      // This is async but we return sync - the next call will have it cached
    })
    .catch((err) => {
      getLogger().debug(
        { error: String(err), agentId: canonical },
        'Failed to cache agent display name'
      );
    });

  // Return first name from ID as fallback (e.g., 'peter-john' → 'Peter')
  const firstName = canonical.split('-')[0];
  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}

/**
 * Get display name asynchronously (preferred for new code)
 */
export async function getAgentDisplayNameAsync(agentId: string): Promise<string> {
  return AgentDirectory.getDisplayName(agentId);
}

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
export function getAgentContext(): string {
  // Use cached context ONLY if it matches current agent
  // FIX BUG: Previously returned stale context causing identity confusion (Alex thinks he's Nayan)
  if (cachedAgentContext !== null && cachedAgentContext.agentId === currentAgent) {
    return cachedAgentContext.context;
  }

  // Start async fetch in background - context will be available on next call
  void fetchAgentContextAsync(currentAgent);

  // FIX BUG #5: Return a MINIMAL identity context instead of empty
  // This prevents identity confusion during the brief window while async loads
  const displayName = getAgentDisplayName(currentAgent);
  const fallbackContext = `[IDENTITY REMINDER: You are ${displayName}. Stay in character.]`;

  getLogger().debug(
    { currentAgent, cachedAgent: cachedAgentContext?.agentId, fallback: true },
    'Agent context cache miss - returning fallback identity (async fetch started)'
  );
  return fallbackContext;
}

// Cache for async context loading
let cachedAgentContext: { agentId: string; context: string } | null = null;

/**
 * Async version of getAgentContext - preferred when you can await.
 * Loads context from manifest via AgentDirectory.
 */
export async function getAgentContextAsync(): Promise<string> {
  const context = await AgentDirectory.getLLMContext(currentAgent);
  cachedAgentContext = { agentId: currentAgent, context };
  return context;
}

/**
 * Internal: Fetch context in background and cache it
 */
async function fetchAgentContextAsync(agentId: string): Promise<void> {
  try {
    const context = await AgentDirectory.getLLMContext(agentId);
    cachedAgentContext = { agentId, context };
  } catch (error) {
    getLogger().warn({ error, agentId }, 'Failed to fetch agent context from manifest');
  }
}

/**
 * Normalize any agent ID to canonical form for internal tracking.
 * This is an alias for toCanonicalId for backward compatibility.
 */
export function normalizeAgentId(agentId: string): AgentId {
  return toCanonicalId(agentId);
}

/**
 * Suggest a handoff based on user input.
 * Returns whether a handoff is suggested and to which agent.
 */
export function suggestHandoff(userInput: string): {
  suggest: boolean;
  to: AgentId | null;
  reason: string | null;
} {
  // Import detection functions dynamically to avoid circular deps
  // For now, return no suggestion - the detection is handled by the handoff tools themselves
  return { suggest: false, to: null, reason: null };
}

// FIX BUG #7: Module-level cache for team data to enable sync access
let cachedTeamForHandoff: Array<{ id: AgentId; name: string; specialty: string }> | null = null;
let teamCachePromise: Promise<void> | null = null;

/**
 * Get all available team members for handoff.
 *
 * REFACTORED: Now delegates to AgentDirectory.
 * No hardcoded team list - discovered from manifests!
 *
 * FIX BUG #7: Now returns cached data instead of empty array.
 * First call triggers async load, subsequent calls return cached data.
 */
export function getTeamForHandoff(): Array<{ id: AgentId; name: string; specialty: string }> {
  // Return cached data if available
  if (cachedTeamForHandoff) {
    return cachedTeamForHandoff;
  }

  // Trigger async load if not already in progress
  if (!teamCachePromise) {
    teamCachePromise = AgentDirectory.getTeamForHandoff()
      .then((team) => {
        cachedTeamForHandoff = team.map((t) => ({
          id: t.id as AgentId,
          name: t.name,
          specialty: t.specialty,
        }));
        getLogger().debug({ count: cachedTeamForHandoff.length }, 'Team for handoff cache loaded');
      })
      .catch((err) => {
        getLogger().warn({ error: err }, 'Failed to load team for handoff');
        teamCachePromise = null; // Allow retry
      });
  }

  // Return fallback team while loading
  // This ensures the first call isn't empty
  return [
    { id: 'ferni' as AgentId, name: 'Ferni', specialty: 'life coaching and team coordination' },
    { id: 'peter-john' as AgentId, name: 'Peter', specialty: 'stock picking and research' },
    { id: 'alex-chen' as AgentId, name: 'Alex', specialty: 'communication and writing' },
    { id: 'maya-santos' as AgentId, name: 'Maya', specialty: 'habits and routines' },
    { id: 'jordan-taylor' as AgentId, name: 'Jordan', specialty: 'event planning' },
    { id: 'nayan-patel' as AgentId, name: 'Nayan', specialty: 'wisdom and philosophy' },
  ];
}

/**
 * Get all available team members for handoff (async version).
 * Preferred over sync version for new code.
 */
export async function getTeamForHandoffAsync(): Promise<
  Array<{ id: string; name: string; specialty: string; emoji: string }>
> {
  return AgentDirectory.getTeamForHandoff();
}
